import { describe, expect, it } from "vitest";
import { pack } from "msgpackr";
import { NEUTRAL_INPUT, NET_EVENT_KIND, PLACEHOLDER_MAP, encodeNetEvent, loadBalance, setLoadout, spawnZombie, startWave, TICK_DT_S, type NetEventContext } from "@topdown/shared";
import { RunController } from "./RunController";

const balance = loadBalance();
const SECONDS = 30;
const TICKS = SECONDS / TICK_DT_S;
const CROWD = 150;

interface Bw {
  /** All of `sim.events_flushed` per client (everything to everyone: no interest filter, the worst case). */
  eventBps: number;
  /** Story 5.4: the flame burst edges (flame_started/stopped) and friendly-fire player.damaged, packed one by one. */
  flameBps: number;
  /** The tuples a shot causes directly: weapon.fired and zombie.hit (packed one by one). */
  firedBps: number;
  hitBps: number;
  shots: number;
  kills: number;
  /** Story 5.5: `grenade.launched` + `explosion.happened` (packed one by one), B/s, and how many blasts. */
  lobBps: number;
  blasts: number;
}

/**
 * Story 5.3 (AC 14, brief line 11): 4 players, each with `weapon` (or idle), standing 2 m apart at
 * x = 10 and firing east into a 150-zombie crowd (standing still, a new one where one died) for
 * 30 s, online (lag compensation on, like the server). Per client: every event to everyone.
 */
function measure(weapon: string | null, firing = 4, pulse = false): Bw {
  const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
  const c = new RunController({ balance, seed: 11, players, pauseWaves: true, systems: { zombies: () => {} }, map: PLACEHOLDER_MAP });
  const world = c.world;
  world.debug.godMode = true;
  players.forEach(({ playerId }, i) => {
    const p = world.players.get(playerId);
    if (!p) throw new Error(playerId);
    p.x = p.prevX = 10;
    p.y = p.prevY = 12 + i * 2.5;
    if (weapon) setLoadout(balance, p.loadout, [weapon, null]);
  });
  startWave(world);
  const spots: [number, number][] = [];
  for (let i = 0; i < CROWD; i++) spots.push([12 + (i % 10) * 0.8, 10.5 + Math.floor(i / 10) * 0.75]);
  const ids = spots.map(([x, y]) => spawnZombie(world, "walker", x, y));
  const ctx: NetEventContext = { balance, zombieNetId: (id) => id | ((world.zombies.generation[id] ?? 0) << 8) };
  let eventBytes = 0;
  let firedBytes = 0;
  let hitBytes = 0;
  let flameBytes = 0;
  let shots = 0;
  let kills = 0;
  let lobBytes = 0;
  let blasts = 0;
  for (let t = 0; t < TICKS; t++) {
    for (let i = 0; i < CROWD; i++) {
      if ((world.zombies.alivePos[ids[i] as number] as number) < 0) {
        const [x, y] = spots[i] as [number, number];
        ids[i] = spawnZombie(world, "walker", x, y);
      }
    }
    // Story 5.5: a launcher aims 6 m out (the aim length carries the distance; others ignore it: normalised).
    const aimX = balance.weapons[weapon ?? ""]?.kind === "launcher" ? 0.5 : 1;
    // Story 5.4 `pulse`: the trigger held 1.5 s, released 0.5 s (bursts: the flame edge events flow)
    const held = !pulse || t % 40 < 30;
    players.forEach(({ playerId }, i) => c.queueInput(playerId, { ...NEUTRAL_INPUT, seq: t + 1, aimX, aimY: 0, fire: weapon !== null && i < firing && held, isMouse: true }));
    const events = c.tick();
    const tuples = [];
    for (const e of events) {
      const tu = encodeNetEvent(e, ctx);
      if (!tu) continue;
      tuples.push(tu);
      if (tu[0] === NET_EVENT_KIND.WEAPON_FIRED) {
        shots++;
        firedBytes += pack(tu).length;
      } else if (tu[0] === NET_EVENT_KIND.ZOMBIE_HIT) hitBytes += pack(tu).length;
      else if (tu[0] === NET_EVENT_KIND.FLAME_STARTED || tu[0] === NET_EVENT_KIND.FLAME_STOPPED || (tu[0] === NET_EVENT_KIND.PLAYER_DAMAGED && tu.length > 4)) flameBytes += pack(tu).length;
      else if (tu[0] === NET_EVENT_KIND.ZOMBIE_KILLED && e.type === "zombie.killed" && e.weapon === weapon) kills++;
      else if (tu[0] === NET_EVENT_KIND.GRENADE_LAUNCHED || tu[0] === NET_EVENT_KIND.EXPLOSION_HAPPENED) {
        lobBytes += pack(tu).length;
        if (tu[0] === NET_EVENT_KIND.EXPLOSION_HAPPENED) blasts++;
      }
    }
    eventBytes += tuples.length > 0 ? pack({ tick: world.tick, events: tuples }).length : 0;
  }
  return { eventBps: eventBytes / SECONDS, firedBps: firedBytes / SECONDS, hitBps: hitBytes / SECONDS, flameBps: flameBytes / SECONDS, shots, kills, lobBps: lobBytes / SECONDS, blasts };
}

/** The story's estimate per firing player (weapon.fired + zombie.hit), B/s. */
const ESTIMATE_BPS: Record<string, number> = { shotgun: 155, assault_rifle: 215 };

describe("Shotgun and Assault Rifle bandwidth (Story 5.3, AC 14)", () => {
  it("4 Shotguns / 4 ARs into a 150-zombie crowd: events per client within 1.5 × the estimate, total far under 30 KB/s", () => {
    const idle = measure(null);
    for (const weapon of ["shotgun", "assault_rifle"] as const) {
      const w = measure(weapon);
      const perPlayer = (w.firedBps + w.hitBps) / 4;
      console.log(
        `[weapon bandwidth] 4 × ${weapon}: ${(w.shots / SECONDS / 4).toFixed(2)} shots/s each, ${(w.kills / SECONDS).toFixed(1)} kills/s; ` +
          `weapon.fired ${w.firedBps.toFixed(0)} B/s (${(w.firedBps / Math.max(1, w.shots / SECONDS)).toFixed(1)} B/shot), zombie.hit ${w.hitBps.toFixed(0)} B/s; ` +
          `per firing player ${perPlayer.toFixed(0)} B/s (estimate ${ESTIMATE_BPS[weapon]}); all events ${idle.eventBps.toFixed(0)} → ${w.eventBps.toFixed(0)} B/s per client (+${(w.eventBps - idle.eventBps).toFixed(0)})`,
      );
      // liveness: the guns really fired and killed
      expect(w.shots).toBeGreaterThan(SECONDS * 3); // ≥ 0.75 shots/s per player even with the Shotgun's reloads
      expect(w.kills).toBeGreaterThanOrEqual(50);
      expect(perPlayer).toBeLessThanOrEqual((ESTIMATE_BPS[weapon] as number) * 1.5);
      expect(w.eventBps).toBeLessThan(30 * 1024);
    }
  });
});

describe("Grenade Launcher bandwidth (Story 5.5, AC 10, brief line 11)", () => {
  it("1 and 4 launchers into a 150-zombie crowd: the round and the blast are events (≈ 20–40 B/s per launcher), no per-tick state; total far under 30 KB/s", () => {
    const idle = measure(null);
    for (const firing of [1, 4]) {
      const w = measure("grenade_launcher", firing);
      const perLauncher = (w.firedBps + w.lobBps) / firing;
      console.log(
        `[weapon bandwidth 5.5] ${firing} × grenade_launcher: ${(w.shots / SECONDS / firing).toFixed(2)} shots/s each, ${w.blasts} blasts, ${(w.kills / SECONDS).toFixed(1)} kills/s; ` +
          `weapon.fired ${w.firedBps.toFixed(0)} B/s, grenade.launched + explosion.happened ${w.lobBps.toFixed(0)} B/s, zombie.hit ${w.hitBps.toFixed(0)} B/s (quiet); ` +
          `per launcher (fired + lob) ${perLauncher.toFixed(1)} B/s; all events ${idle.eventBps.toFixed(0)} → ${w.eventBps.toFixed(0)} B/s per client (+${(w.eventBps - idle.eventBps).toFixed(0)}, kills included)`,
      );
      expect(w.blasts).toBeGreaterThanOrEqual(firing * 15); // liveness: ≥ 1 explosion (and many)
      expect(w.kills).toBeGreaterThanOrEqual(30);
      expect(w.hitBps).toBe(0); // blast hits are quiet
      expect(perLauncher).toBeLessThanOrEqual(40 * 1.5);
      expect(w.eventBps).toBeLessThan(30 * 1024);
    }
  });
});

describe("Flamethrower bandwidth (Story 5.4, AC 10)", () => {
  it("4 flamers into the 150-zombie crowd (held and in bursts) vs 4 SMGs: no zombie.hit per pulse, burst edges only, events far under the SMG's", () => {
    const smg = measure("smg");
    for (const weapon of ["flamethrower", "gas_torch"] as const) {
      for (const pulse of [false, true]) {
        const f = measure(weapon, 4, pulse);
        console.log(
          `[weapon bandwidth 5.4] 4 × ${weapon}${pulse ? " (bursts 1.5 s on / 0.5 s off)" : " (held)"}: ${(f.kills / SECONDS).toFixed(1)} kills/s; zombie.hit ${f.hitBps.toFixed(0)} B/s; flame edges ${f.flameBps.toFixed(0)} B/s; ` +
            `all events ${f.eventBps.toFixed(0)} B/s per client vs 4 × SMG ${smg.eventBps.toFixed(0)} B/s (SMG zombie.hit ${smg.hitBps.toFixed(0)} B/s)`,
        );
        expect(f.kills).toBeGreaterThanOrEqual(50); // liveness: the flames really killed
        expect(f.hitBps).toBe(0); // quiet hits: never a zombie.hit per pulse
        expect(f.firedBps).toBe(0); // no weapon.fired per tick
        expect(f.flameBps).toBeLessThanOrEqual(4 * 2 * 4); // ≤ 1 burst/s per flamer: 2 edges × ≤ 4 B
        expect(f.eventBps).toBeLessThan(smg.eventBps);
      }
    }
  });
});
