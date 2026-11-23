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
  // Story 5.2: the Fire Axe's heavy whoosh and thunk (the Chainsaw's rev is a loop: `startChainsawRev`).
  | "weapon_axe_swing"
  | "weapon_reload_start"
  | "weapon_reloaded"
  | "zombie_hit"
  | "building_repaired"
  | "turret_fire"
  | "zombie_runner_shriek"
  | "building_mine_blast"
  | "building_upgraded"

  // Story 5.6: the Spitter's windup gurgle (positional), its spit, and the acid's hiss.
  | "zombie_spitter_gurgle"
  | "zombie_spitter_spit"
  | "fx_acid_hiss"
  // Story 5.7: the Brute's roar (positional; on every Brute's spawn).
  | "zombie_brute_roar"
  // Story 5.5: the Grenade Launcher's hollow "thoonk" and a blast (positional, rate-limited).
  | "weapon_grenade_launch"
  | "fx_explosion"
  | "zombie_bloater_gurgle"
  | "zombie_bloater_swell"
  | "zombie_bloater_burst";

const MASTER_GAIN = 0.25;
const HIT_MIN_INTERVAL_S = 0.03;
/** Story 5.9: mines going off in the same instant make one blast sound. */
const BLAST_MIN_INTERVAL_S = 0.08;
let lastBlastAt = -1;
/** Story 5.8: the swell sound's length (the balance `explodes.swellS`, 1 s; cosmetic). */
const BLOATER_SWELL_SFX_S = 1.0;

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

/** Story 5.7: a low, long roar: two detuned growling saws under a falling noise band (panned). */
function roar(c: AudioContext, at: number, pan: number): void {
  const out = outputFor(c, pan);
  if (!out || !noise) return;
  const dur = 1.1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, at);
  g.gain.exponentialRampToValueAtTime(0.5, at + 0.12);
  g.gain.exponentialRampToValueAtTime(0.25, at + 0.7);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, at);
  lp.frequency.exponentialRampToValueAtTime(300, at + dur);
  lp.connect(g).connect(out);
  const trem = c.createOscillator();
  trem.frequency.value = 31;
  const tremGain = c.createGain();
  tremGain.gain.value = 18;
  trem.connect(tremGain);
  for (const detune of [0, 23]) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(95, at);
    o.frequency.exponentialRampToValueAtTime(62, at + dur);
    o.detune.value = detune;
    tremGain.connect(o.frequency);
    o.connect(lp);
    o.start(at);
    o.stop(at + dur);
  }
  trem.start(at);
  trem.stop(at + dur);
  const src = c.createBufferSource();
  src.buffer = noise;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(700, at);
  bp.frequency.exponentialRampToValueAtTime(250, at + dur);
  src.connect(bp).connect(lp);
  src.start(at);
  src.stop(at + dur);
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

/**
 * Story 5.6: the Spitter's windup gurgle (FR84): a low wet bubbling — a square voice wobbling at
 * ~14 Hz through a low band-pass, swelling over the 0.6 s windup, with a little noise on top.
 */
function gurgle(c: AudioContext, at: number, pan: number): void {
  const out = outputFor(c, pan);
  if (!out || !noise) return;
  const dur = 0.6;
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, at);
  g.gain.exponentialRampToValueAtTime(0.3, at + dur * 0.8);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 3;
  bp.frequency.setValueAtTime(260, at);
  bp.frequency.exponentialRampToValueAtTime(520, at + dur);
  bp.connect(g).connect(out);
  const o = c.createOscillator();
  o.type = "square";
  o.frequency.setValueAtTime(90, at);
  o.frequency.exponentialRampToValueAtTime(150, at + dur);
  const wob = c.createOscillator();
  wob.frequency.value = 14;
  const wobGain = c.createGain();
  wobGain.gain.value = 40;
  wob.connect(wobGain).connect(o.frequency);
  o.connect(bp);
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const hiss = c.createGain();
  hiss.gain.value = 0.2;
  src.connect(hiss).connect(bp);
  for (const n of [o, wob, src]) {
    n.start(at);
    n.stop(at + dur);
  }
}

/**
 * Story 5.8: the Bloater's swell (FR84 telegraph): a wet, rising stretch over the 1 s fuse — a
 * sine climbing an octave and a half under a tightening band-pass, with bubbling on top. Placeholder
 * until Epic 9's sounds.
 */
function swellRise(c: AudioContext, at: number, pan: number, dur: number): void {
  const out = outputFor(c, pan);
  if (!out || !noise) return;
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, at);
  g.gain.exponentialRampToValueAtTime(0.35, at + dur * 0.92);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 4;
  bp.frequency.setValueAtTime(180, at);
  bp.frequency.exponentialRampToValueAtTime(900, at + dur);
  bp.connect(g).connect(out);
  const o = c.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(70, at);
  o.frequency.exponentialRampToValueAtTime(220, at + dur);
  const wob = c.createOscillator();
  wob.frequency.setValueAtTime(8, at);
  wob.frequency.linearRampToValueAtTime(22, at + dur);
  const wobGain = c.createGain();
  wobGain.gain.value = 25;
  wob.connect(wobGain).connect(o.frequency);
  o.connect(bp);
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const hiss = c.createGain();
  hiss.gain.value = 0.15;
  src.connect(hiss).connect(bp);
  for (const n of [o, wob, src]) {
    n.start(at);
    n.stop(at + dur);
  }
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
    case "weapon_axe_swing": // Story 5.2: a slower, deeper whoosh with a low thunk at its end
      sweep(c, t, 0.2, 0.6, 400, 1600);
      burst(c, t + 0.12, 0.08, 0.6, 300);
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
    case "building_mine_blast": // Story 5.9: a deep thump with a noisy tail (rate-limited: a field of mines)
      if (t - lastBlastAt < BLAST_MIN_INTERVAL_S) return;
      lastBlastAt = t;
      burst(c, t, 0.35, 1, 180);
      burst(c, t + 0.02, 0.2, 0.6, 900);
      break;
    case "weapon_grenade_launch": // Story 5.5: a hollow low pop with a short tube ring
      click(c, t, 220, 0.5);
      burst(c, t, 0.06, 0.5, 600);
      break;
    case "fx_explosion": // Story 5.5: a big low boom with a noisy crackle (shares the blast rate limit)
      if (t - lastBlastAt < BLAST_MIN_INTERVAL_S) return;
      lastBlastAt = t;
      burst(c, t, 0.5, 1, 140);
      burst(c, t + 0.03, 0.3, 0.7, 1100);
      break;
    case "building_upgraded": // Story 5.9: a metallic clank
      click(c, t, 1800, 0.4);
      burst(c, t + 0.05, 0.08, 0.5, 2600);
      break;
    case "turret_fire": // Story 3.6: a soft, high, short tick (quieter than a gun)
      if (t - lastTurretAt < TURRET_MIN_INTERVAL_S) return;
      lastTurretAt = t;
      burst(c, t, 0.03, 0.35, 5000);
      click(c, t, 1400, 0.15);
      break;
    case "zombie_spitter_gurgle":
      gurgle(c, t, pan);
      break;
    case "zombie_spitter_spit": // a wet "ptoo": a short low burst and a falling band
      burst(c, t, 0.08, 0.5, 700);
      sweep(c, t, 0.15, 0.3, 1400, 400);
      break;
    case "fx_acid_hiss":
      sweep(c, t, 0.35, 0.25, 5000, 2500);
      break;
    case "zombie_brute_roar": // Story 5.7
      roar(c, t, pan);
      break;
    case "zombie_bloater_gurgle": // Story 5.8: a Bloater first in view (a low, slow gurgle)
      gurgle(c, t, pan);
      break;
    case "zombie_bloater_swell": // Story 5.8: the 1 s fuse
      swellRise(c, t, pan, BLOATER_SWELL_SFX_S);
      break;
    case "zombie_bloater_burst": // Story 5.8: a wet pop and a gassy whoosh (rate-limited like the mine blast: a chain)
      if (t - lastBlastAt < BLAST_MIN_INTERVAL_S) return;
      lastBlastAt = t;
      burst(c, t, 0.22, 0.9, 260);
      sweep(c, t + 0.03, 0.5, 0.35, 1800, 500);
      break;
    case "zombie_hit":
      if (t - lastHitAt < HIT_MIN_INTERVAL_S) return;
      lastHitAt = t;
      burst(c, t, 0.05, 0.4, 500);
      break;
  }
}

/** Story 5.2: the Chainsaw's placeholder rev loop (`weapon_chainsaw_rev`): nodes of the running loop. */
let rev: { stop(at: number): void } | null = null;
const REV_GAIN = 0.16;
const REV_FADE_S = 0.08;

/**
 * Starts the looping rev (a buzzing sawtooth chopped at 22 Hz through a low-pass, with a little
 * hiss). Called once when my Chainsaw starts cutting (`SawClock.revStep`), never per swing or frame.
 */
export function startChainsawRev(): boolean {
  if (rev) return true;
  const c = context();
  if (!c || c.state !== "running" || !master || !noise) return false; // review L3: not started (the caller retries)
  const t = c.currentTime;
  const out = c.createGain();
  out.gain.setValueAtTime(0.001, t);
  out.gain.exponentialRampToValueAtTime(REV_GAIN, t + REV_FADE_S);
  out.connect(master);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400;
  lp.connect(out);
  const o = c.createOscillator();
  o.type = "sawtooth";
  o.frequency.value = 112;
  const chop = c.createGain();
  chop.gain.value = 0.6;
  const lfo = c.createOscillator();
  lfo.frequency.value = 22;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.4;
  lfo.connect(lfoGain).connect(chop.gain);
  o.connect(chop).connect(lp);
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const hiss = c.createGain();
  hiss.gain.value = 0.25;
  src.connect(hiss).connect(lp);
  for (const n of [o, lfo, src]) n.start(t);
  rev = {
    stop(at: number) {
      out.gain.cancelScheduledValues(at);
      out.gain.setValueAtTime(Math.max(0.001, out.gain.value), at);
      out.gain.exponentialRampToValueAtTime(0.001, at + REV_FADE_S);
      for (const n of [o, lfo, src]) n.stop(at + REV_FADE_S);
    },
  };
  return true;
}

/** Stops the rev loop (a short fade). */
export function stopChainsawRev(): void {
  const c = ctx;
  if (!rev || !c) {
    rev = null;
    return;
  }
  rev.stop(c.currentTime);
  rev = null;
}
