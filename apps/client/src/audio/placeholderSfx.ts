/**
 * Placeholder sounds synthesized with the Web Audio API (no files yet). Names follow the asset rule
 * (`weapon_pistol_fire` …) so Story 9.10 swaps in real recordings. iOS keeps audio locked until a
 * user gesture: call `unlockAudio()` from the first touch.
 */
export type SfxName =
  | "weapon_pistol_fire"
  | "weapon_shotgun_fire"
  | "weapon_assault_rifle_fire"
  | "weapon_machete_swing"
  | "weapon_reload_start"
  | "weapon_reloaded"
  | "zombie_hit"
  | "building_repaired"
  | "turret_fire"
  | "zombie_runner_shriek";

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

/**
 * Story 4.6: the shared AudioContext once a user gesture has unlocked it (`running`), else null.
 * Never creates one (the ambience waits for `unlockAudio`). One context, one gesture, for every bus.
 */
export function audioContextIfRunning(): AudioContext | null {
  return ctx !== null && ctx.state === "running" ? ctx : null;
}

/**
 * Resumes the context after a user gesture whenever it is not running (review L: not only
 * "suspended" — iOS reports "interrupted" after a call or Siri) and not closed.
 */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state !== "running" && c.state !== "closed") void c.resume();
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

/** Story 3.8: the output for one sound, panned -1 (left) … +1 (right) when the browser can. */
function outputFor(c: AudioContext, pan: number): AudioNode | null {
  if (!master) return null;
  if (pan === 0 || typeof c.createStereoPanner !== "function") return master;
  const p = c.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(master);
  return p;
}

/**
 * Story 3.8: the Runner's shriek (FR84): two detuned saw voices screeching up and falling away,
 * with a vibrato and a band of hiss on top. ~0.4 s.
 */
function shriek(c: AudioContext, at: number, pan: number): void {
  const out = outputFor(c, pan);
  if (!out || !noise) return;
  const dur = 0.42;
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, at);
  g.gain.exponentialRampToValueAtTime(0.32, at + 0.04);
  g.gain.exponentialRampToValueAtTime(0.12, at + 0.25);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 2.5;
  bp.frequency.setValueAtTime(1800, at);
  bp.frequency.exponentialRampToValueAtTime(2600, at + 0.08);
  bp.frequency.exponentialRampToValueAtTime(1100, at + dur);
  bp.connect(g).connect(out);
  const vib = c.createOscillator();
  vib.frequency.value = 23;
  const vibGain = c.createGain();
  vibGain.gain.value = 60;
  vib.connect(vibGain);
  for (const detune of [0, 37]) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(900 + detune, at);
    o.frequency.exponentialRampToValueAtTime(1500 + detune, at + 0.07);
    o.frequency.exponentialRampToValueAtTime(620 + detune, at + dur);
    vibGain.connect(o.frequency);
    o.connect(bp);
    o.start(at);
    o.stop(at + dur);
  }
  vib.start(at);
  vib.stop(at + dur);
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const hiss = c.createGain();
  hiss.gain.value = 0.35;
  src.connect(hiss).connect(bp);
  src.start(at);
  src.stop(at + dur);
}

/** `pan` (-1 left … +1 right) is used by positional cues (the Runner's shriek); the others ignore it. */
export function playSfx(name: SfxName, pan = 0): void {
  const c = context();
  if (!c || c.state !== "running") return;
  const t = c.currentTime;
  switch (name) {
    case "weapon_pistol_fire":
      burst(c, t, 0.06, 0.9, 3500);
      click(c, t, 200, 0.5);
      break;
    case "weapon_shotgun_fire": // Story 5.3: a deep, long boom
      burst(c, t, 0.16, 1, 1400);
      click(c, t, 90, 0.8);
      break;
    case "weapon_assault_rifle_fire": // Story 5.3: a sharp crack, shorter than the pistol's (8/s)
      burst(c, t, 0.045, 0.8, 4200);
      click(c, t, 260, 0.4);
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
    case "zombie_runner_shriek":
      shriek(c, t, pan);
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
