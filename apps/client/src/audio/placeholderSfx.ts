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
  // Story 5.20: a sell / take back (two bright coin pings).
  | "building_sold"
  // Story 5.14: a bear trap's jaws snapping shut (a hard metallic clack, rate-limited like the blast).
  | "building_bear_trap_snap"

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
  | "zombie_bloater_burst"
  // A teammate went down: a two-note falling alert (not positional: the edge arrow shows where).
  | "player_teammate_downed"
  // Story 5.23 (ux-spec §10): a building into my hands (soft click); placed: a wooden "thunk", a metal
  // "clank", a floor trap's "click"; my placement refused: a dull buzz. Placed sounds take a pan and a volume.
  | "ui_build_pick"
  // Story 8.7 (AC 8, E8-P3): the ping chirp, panned toward the ping; "Help!" plays it twice, 80 ms apart.
  | "ping"
  | "ping_double"
  | "building_placed_thunk"
  | "building_placed_clank"
  | "building_placed_click"
  | "building_place_refused"
  // Story 6.5: the Behemoth's warning rumble, arrival roar and slam (not positional: team cues).
  | "boss_rumble"
  | "boss_roar"
  | "boss_slam"
  // Story 6.2: the Ruins collapse rumble (stage 4 starts: D9) and a falling-debris patter (panned ambience, D10).
  | "ruins_rumble"
  | "debris_fall"
  // Stories 6.6 / 6.7
  | "boss_charge_scrape"
  | "boss_charge_rush"
  | "boss_crash"
  | "boss_throw_lift"
  | "boss_throw_impact"
  | "boss_roar_enrage"
  | "boss_crawler_drop"
  | "boss_death"
  // Story 6.8: the car alarm's arming chirp and the stampede's warning rumble (team cues; the alarm
  // itself is the positional loop `startCarAlarmLoop`).
  | "event_car_alarm_armed"
  | "event_stampede_rumble"
  // Stories 6.9 / 6.10: gas hiss, flare pop, crate land / taken, power down, the survivor's call and save.
  | "event_gas_hiss"
  | "event_flare_pop"
  | "event_crate_land"
  | "event_crate_taken"
  | "event_power_down"
  | "event_survivor_help"
  | "event_survivor_saved"
  // Story 7.12: the loot bag lands (soft, where it fell) / someone takes it.
  | "loot_drop"
  | "loot_found";

const MASTER_GAIN = 0.25;
const HIT_MIN_INTERVAL_S = 0.03;
/** Story 5.9: mines going off in the same instant make one blast sound. */
const BLAST_MIN_INTERVAL_S = 0.08;
let lastBlastAt = -1;
/** Story 5.14: at most one bear-trap clack per this many seconds. */
const SNAP_MIN_INTERVAL_S = 0.06;
let lastSnapAt = -1;
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

/** A clean triangle-wave note with a soft attack and decay (UI alerts). */
function tone(c: AudioContext, at: number, durS: number, gain: number, hz: number): void {
  if (!master) return;
  const o = c.createOscillator();
  o.type = "triangle";
  o.frequency.value = hz;
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, at + durS);
  o.connect(g).connect(master);
  o.start(at);
  o.stop(at + durS + 0.02);
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

/** Story 5.23: one voice into `out`: an oscillator of `type` gliding `fromHz` → `toHz`, an exponential decay of `durS`. */
function voice(c: AudioContext, out: AudioNode, at: number, durS: number, gain: number, type: OscillatorType, fromHz: number, toHz: number): void {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(fromHz, at);
  o.frequency.exponentialRampToValueAtTime(toHz, at + durS);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + durS);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + durS + 0.02);
}

/** Story 5.23: noise through a low-pass into `out` (the placed sounds' body). */
function noiseInto(c: AudioContext, out: AudioNode, at: number, durS: number, gain: number, filterHz: number): void {
  if (!noise) return;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = filterHz;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + durS);
  src.connect(f).connect(g).connect(out);
  src.start(at);
  src.stop(at + durS);
}

/** Story 8.7 (AC 8): "Help!" plays the ping chirp twice, this far apart (s). */
export const PING_DOUBLE_GAP_S = 0.08;

/** Story 5.23: at most one of each placed sound per this many seconds (four players placing at once). */
const PLACED_MIN_INTERVAL_S = 0.05;
const lastPlacedAt: Record<string, number> = { building_placed_thunk: -1, building_placed_clank: -1, building_placed_click: -1 };

/** Story 5.23 (AC 2, 3): the placement sounds, panned and scaled by `volume` (a far teammate's is quieter). */
function placeSfx(c: AudioContext, name: SfxName, t: number, pan: number, volume: number): void {
  const panned = outputFor(c, pan);
  if (!panned) return;
  const out = c.createGain();
  out.gain.value = Math.max(0, Math.min(1, volume));
  out.connect(panned);
  switch (name) {
    case "ui_build_pick": // a soft, short tick
      voice(c, out, t, 0.035, 0.18, "triangle", 1900, 1500);
      break;
    case "ping": // Story 8.7: a short rising two-tone chirp (never a danger sound)
    case "ping_double":
      for (let i = 0; i < (name === "ping_double" ? 2 : 1); i++) {
        const at = t + i * PING_DOUBLE_GAP_S;
        voice(c, out, at, 0.07, 0.32, "sine", 1180, 1560);
        voice(c, out, at + 0.035, 0.06, 0.18, "triangle", 2350, 2350);
      }
      break;
    case "building_placed_thunk": // wood: a low body knock with a dull thud
      voice(c, out, t, 0.16, 0.7, "sine", 150, 70);
      noiseInto(c, out, t, 0.09, 0.5, 700);
      break;
    case "building_placed_clank": // metal: two bright partials and a short ring
      voice(c, out, t, 0.22, 0.32, "square", 520, 480);
      voice(c, out, t, 0.3, 0.22, "triangle", 1340, 1290);
      noiseInto(c, out, t, 0.05, 0.4, 3200);
      break;
    case "building_placed_click": // a floor trap / mine set down: a small mechanical double click
      voice(c, out, t, 0.03, 0.4, "square", 2600, 2000);
      voice(c, out, t + 0.045, 0.03, 0.3, "square", 1800, 1400);
      break;
    case "building_place_refused": // a dull buzz (D8)
      {
        const lp = c.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 600;
        lp.connect(out);
        voice(c, lp, t, 0.18, 0.35, "square", 110, 104);
      }
      break;
    default:
      break;
  }
}

/**
 * `pan` (-1 left … +1 right) is used by positional cues (the Runner's shriek); the others ignore it.
 * Story 5.23: `volume` (0–1) scales the placement sounds only (a teammate's beyond 12 m is quieter).
 */
export function playSfx(name: SfxName, pan = 0, volume = 1): void {
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
    case "building_bear_trap_snap": // Story 5.14: a hard double clack (rate-limited: a line of traps)
      if (t - lastSnapAt < SNAP_MIN_INTERVAL_S) return;
      lastSnapAt = t;
      click(c, t, 2400, 0.55);
      click(c, t + 0.025, 1600, 0.45);
      burst(c, t, 0.05, 0.4, 3200);
      break;
    case "building_sold": // Story 5.20: coins: two quick high pings and a faint jingle
      click(c, t, 2600, 0.3);
      click(c, t + 0.07, 3300, 0.3);
      burst(c, t + 0.02, 0.1, 0.2, 6000);
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
    case "boss_rumble": // Story 6.5: the 4 s warning (a long low rumble swelling up)
      burst(c, t, 1.2, 0.9, 90);
      burst(c, t + 1.0, 1.4, 1, 70);
      burst(c, t + 2.2, 1.6, 1, 60);
      break;
    case "boss_roar": // Story 6.5: the arrival (the Brute's roar, lower and longer, twice)
      roar(c, t, pan);
      roar(c, t + 0.25, pan);
      burst(c, t, 0.9, 0.8, 120);
      break;
    case "event_car_alarm_armed": // Story 6.8: a car's arming chirp (two short high beeps)
      click(c, t, 2200, 0.35);
      click(c, t + 0.14, 2200, 0.35);
      break;
    case "event_gas_hiss": // Story 6.9: a long high hiss (the leak)
      burst(c, t, 2.2, 0.35, 5200);
      burst(c, t + 1.8, 2.0, 0.3, 4800);
      break;
    case "event_flare_pop": // Story 6.9: the flare pops and fizzes
      click(c, t, 900, 0.5);
      burst(c, t + 0.05, 1.2, 0.3, 2600);
      break;
    case "event_crate_land": // Story 6.9: a heavy thud
      burst(c, t, 0.35, 0.9, 140);
      click(c, t + 0.02, 300, 0.3);
      break;
    case "event_crate_taken": // Story 6.9: latches + a rising chime
      click(c, t, 1400, 0.3);
      tone(c, t + 0.05, 0.18, 0.25, 660);
      tone(c, t + 0.2, 0.25, 0.25, 990);
      break;
    case "loot_drop": // Story 7.12: a soft cloth flop and a faint sparkle (quiet: heard by everyone)
      burst(c, t, 0.18, 0.35, 380);
      tone(c, t + 0.08, 0.12, 0.08, 1760);
      break;
    case "loot_found": // Story 7.12: a zip and a bright three-note rise
      sweep(c, t, 0.14, 0.25, 1800, 5200);
      tone(c, t + 0.12, 0.12, 0.22, 784);
      tone(c, t + 0.22, 0.12, 0.22, 988);
      tone(c, t + 0.32, 0.22, 0.22, 1319);
      break;
    case "event_power_down": // Story 6.10 (D1): a thunk and a dying hum
      burst(c, t, 0.3, 0.9, 160);
      sweep(c, t + 0.05, 1.6, 0.3, 120, 30);
      break;
    case "event_survivor_help": // Story 6.10: a call for help (two falling tones)
      sweep(c, t, 0.35, 0.25, 700, 520);
      sweep(c, t + 0.45, 0.45, 0.25, 760, 480);
      break;
    case "event_survivor_saved": // Story 6.10: a bright two-note chime
      tone(c, t, 0.2, 0.3, 784);
      tone(c, t + 0.18, 0.35, 0.3, 1046);
      break;
    case "event_stampede_rumble": // Story 6.8: the 3 s warning — a rolling low rumble of hooves
      burst(c, t, 0.9, 0.7, 110);
      burst(c, t + 0.8, 1.0, 0.85, 95);
      burst(c, t + 1.7, 1.3, 1, 85);
      break;
    case "ruins_rumble": // Story 6.2 (D9): 2 s of low rumble with a crumbling tail
      burst(c, t, 1.0, 0.8, 80);
      burst(c, t + 0.6, 1.4, 0.7, 60);
      burst(c, t + 0.2, 0.9, 0.35, 900);
      break;
    case "debris_fall": // Story 6.2 (D10): a few small stones (quiet, panned)
      {
        const out = outputFor(c, pan);
        if (!out) break;
        for (let i = 0; i < 3; i++) noiseInto(c, out, t + i * 0.07, 0.05, 0.18 - i * 0.04, 2400 - i * 500);
      }
      break;
    case "boss_slam": // Story 6.5: a huge ground thump with a cracking tail
      burst(c, t, 0.45, 1, 110);
      burst(c, t + 0.03, 0.3, 0.7, 700);
      click(c, t + 0.05, 70, 0.9);
      break;
    case "boss_charge_scrape": // Story 6.6: the charge's wind-up (hooves on asphalt: a grinding sweep, twice)
      sweep(c, t, 0.4, 0.5, 300, 120);
      sweep(c, t + 0.45, 0.4, 0.5, 300, 120);
      break;
    case "boss_charge_rush": // Story 6.6: the rush (a rising roar of footfalls)
      burst(c, t, 0.7, 0.8, 140);
      sweep(c, t, 0.7, 0.4, 200, 600);
      break;
    case "boss_crash": // Story 6.6: it hits hard cover (a metal-and-concrete crunch)
      burst(c, t, 0.5, 1, 90);
      burst(c, t + 0.02, 0.25, 0.8, 1200);
      click(c, t + 0.04, 60, 1);
      break;
    case "boss_throw_lift": // Story 6.6: tearing a chunk loose (a low groan rising)
      sweep(c, t, 0.9, 0.5, 90, 220);
      break;
    case "boss_throw_impact": // Story 6.6: the chunk lands
      burst(c, t, 0.35, 0.9, 130);
      click(c, t + 0.02, 80, 0.8);
      break;
    case "boss_roar_enrage": // Story 6.7: the enrage roar (the arrival roar, three times, higher)
      roar(c, t, pan);
      roar(c, t + 0.2, pan);
      roar(c, t + 0.4, pan);
      break;
    case "boss_crawler_drop": // Story 6.7: a Crawler sloughs off its back (a wet thud)
      burst(c, t, 0.12, 0.5, 220);
      break;
    case "boss_death": // Story 6.7: the collapse (a long falling groan, then a ground thump)
      sweep(c, t, 1.2, 0.6, 180, 50);
      burst(c, t + 1.2, 0.5, 1, 80);
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
    case "player_teammate_downed":
      tone(c, t, 0.16, 0.22, 880);
      tone(c, t + 0.18, 0.28, 0.22, 587);
      break;
    case "building_placed_thunk":
    case "building_placed_clank":
    case "building_placed_click":
      if (t - (lastPlacedAt[name] as number) < PLACED_MIN_INTERVAL_S) return;
      lastPlacedAt[name] = t;
      placeSfx(c, name, t, pan, volume);
      break;
    case "ui_build_pick":
    case "ping":
    case "ping_double":
    case "building_place_refused":
      placeSfx(c, name, t, pan, volume);
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

/** Story 5.4: the flame weapons' placeholder roar loop (`weapon_flamethrower_loop`): filtered noise with a slow flutter. */
let flameLoop: { stop(at: number): void } | null = null;
const FLAME_GAIN = 0.2;
const FLAME_FADE_S = 0.1;

/**
 * Starts the looping roar when MY flame starts (the burst edge, never per tick or frame). Returns
 * false when audio is not running yet (the caller retries next frame).
 */
export function startFlameLoop(): boolean {
  if (flameLoop) return true;
  const c = context();
  if (!c || c.state !== "running" || !master || !noise) return false;
  const t = c.currentTime;
  const out = c.createGain();
  out.gain.setValueAtTime(0.001, t);
  out.gain.exponentialRampToValueAtTime(FLAME_GAIN, t + FLAME_FADE_S);
  out.connect(master);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 420;
  bp.Q.value = 0.7;
  bp.connect(out);
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const flutter = c.createGain();
  flutter.gain.value = 0.75;
  const lfo = c.createOscillator();
  lfo.frequency.value = 9;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.25;
  lfo.connect(lfoGain).connect(flutter.gain);
  src.connect(flutter).connect(bp);
  src.start(t);
  lfo.start(t);
  flameLoop = {
    stop(at: number) {
      out.gain.cancelScheduledValues(at);
      out.gain.setValueAtTime(Math.max(0.001, out.gain.value), at);
      out.gain.exponentialRampToValueAtTime(0.001, at + FLAME_FADE_S);
      src.stop(at + FLAME_FADE_S);
      lfo.stop(at + FLAME_FADE_S);
    },
  };
  return true;
}

/** Stops the roar (a short fade). */
export function stopFlameLoop(): void {
  const c = ctx;
  if (!flameLoop || !c) {
    flameLoop = null;
    return;
  }
  flameLoop.stop(c.currentTime);
  flameLoop = null;
}

/**
 * Story 6.5 (AC 14): the placeholder boss loop on the music bus: a low drone with a slow drum pulse,
 * from `boss.arrived` until the boss dies or the run ends (6.7 owns the death; D8 of 6.7: it stops).
 * Idempotent; `stopBossLoop` fades it out.
 */
let bossLoop: { stop(at: number): void } | null = null;
const BOSS_LOOP_GAIN = 0.35;
const BOSS_LOOP_FADE_S = 0.8;

export function startBossLoop(): boolean {
  if (bossLoop) return true;
  const c = context();
  if (!c || c.state !== "running" || !master) return false;
  const t = c.currentTime;
  const out = c.createGain();
  out.gain.setValueAtTime(0.001, t);
  out.gain.exponentialRampToValueAtTime(BOSS_LOOP_GAIN, t + BOSS_LOOP_FADE_S);
  out.connect(master);
  const drone = c.createOscillator();
  drone.type = "sawtooth";
  drone.frequency.value = 41;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 180;
  const pulse = c.createGain();
  pulse.gain.value = 0.6;
  const lfo = c.createOscillator();
  lfo.type = "square";
  lfo.frequency.value = 1.6; // the drum: ~96 bpm
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.4;
  lfo.connect(lfoGain).connect(pulse.gain);
  drone.connect(lp).connect(pulse).connect(out);
  drone.start(t);
  lfo.start(t);
  bossLoop = {
    stop(at: number) {
      out.gain.cancelScheduledValues(at);
      out.gain.setValueAtTime(Math.max(0.001, out.gain.value), at);
      out.gain.exponentialRampToValueAtTime(0.001, at + BOSS_LOOP_FADE_S);
      drone.stop(at + BOSS_LOOP_FADE_S + 0.05);
      lfo.stop(at + BOSS_LOOP_FADE_S + 0.05);
    },
  };
  return true;
}

export function stopBossLoop(): void {
  if (!bossLoop) return;
  const c = context();
  bossLoop.stop(c ? c.currentTime : 0);
  bossLoop = null;
}

export function bossLoopPlaying(): boolean {
  return bossLoop !== null;
}

/**
 * Story 6.8 (AC 12): the car alarm's placeholder loop — a two-tone siren panned to the car's side of
 * the screen, from the alarm's start until its end (or the event's end for any reason). Idempotent;
 * `setCarAlarmPan` follows the camera; `stopCarAlarmLoop` cuts it.
 */
let alarmLoop: { pan: StereoPannerNode | null; stop(at: number): void } | null = null;
const ALARM_GAIN = 0.18;

export function startCarAlarmLoop(pan: number): boolean {
  if (alarmLoop) return true;
  const c = context();
  if (!c || c.state !== "running" || !master) return false;
  const t = c.currentTime;
  const out = c.createGain();
  out.gain.value = ALARM_GAIN;
  const panner = typeof c.createStereoPanner === "function" ? c.createStereoPanner() : null;
  if (panner) {
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(panner).connect(master);
  } else out.connect(master);
  const osc = c.createOscillator();
  osc.type = "square";
  osc.frequency.value = 900;
  const lfo = c.createOscillator();
  lfo.type = "square";
  lfo.frequency.value = 2.5; // two tones, 2.5 per second
  const lfoGain = c.createGain();
  lfoGain.gain.value = 250;
  lfo.connect(lfoGain).connect(osc.frequency);
  osc.connect(out);
  osc.start(t);
  lfo.start(t);
  alarmLoop = {
    pan: panner,
    stop(at: number) {
      out.gain.setValueAtTime(0.0001, at);
      osc.stop(at + 0.02);
      lfo.stop(at + 0.02);
    },
  };
  return true;
}

export function setCarAlarmPan(pan: number): void {
  if (alarmLoop?.pan) alarmLoop.pan.pan.value = Math.max(-1, Math.min(1, pan));
}

export function stopCarAlarmLoop(): void {
  if (!alarmLoop) return;
  const c = context();
  alarmLoop.stop(c ? c.currentTime : 0);
  alarmLoop = null;
}

export function carAlarmLoopPlaying(): boolean {
  return alarmLoop !== null;
}
