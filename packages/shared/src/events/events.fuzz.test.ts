import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import { createWorld, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import { legalDecayMasks } from "../decay/decayState";
import { applyDecayStage } from "../decay/applyDecayStage";
import { addBuildingAt } from "../buildings/buildings";
import { addPlayer } from "../player/player";
import { spawnZombie } from "../zombies/zombiePool";
import { ZOMBIE_STATE } from "../zombies/zombieTypes";
import type { MapBox } from "../map/districtMap";
import { EVENT_KINDS, EVENT_PHASE } from "./eventState";
import { balance, tickN } from "./testEvents";

/**
 * Story 6.8 (T7, brief 7): random barricade layouts × stages 2–4 × variant masks, each with a forced
 * car alarm and a forced stampede: no body ever inside a map box or a wall building, the alarm's
 * lured zombies reach the car by the lure field (round cover and barricades, never through), the
 * stampede ends with every Runner crossed or converted, and the run goes on (no stall).
 */
const map = DOWNTOWN_MAP;
const MASKS = legalDecayMasks(map);
const LAYOUTS = 6;
const distBox = (x: number, y: number, b: { minX: number; minY: number; maxX: number; maxY: number }): number => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minY - y, 0, y - b.maxY));

function layout(seed: number, stage: number, mask: number): World {
  const w = createWorld({ balance, seed, map });
  applyDecayStage(w, stage, mask);
  const rng = createRng(seed * 7 + stage);
  let id = 500;
  for (let k = 0, tries = 0; k < 8 && tries < 400; tries++) {
    const gx = rng.int(4, 92);
    const gy = rng.int(4, 60);
    const rot = rng.int(0, 1) as 0 | 1;
    const b = addBuildingAt(w, { id, type: "wood_barricade", ownerId: "p0", gx, gy, rot, hp: 200 });
    if (!b) continue;
    const bad = w.obstacles.solids.some((s: MapBox) => distBox((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, s) < 1.5) || w.map.spawnPoints.some((sp) => distBox(sp.x, sp.y, b) < 2.5);
    if (bad) {
      w.buildings.list.splice(w.buildings.list.indexOf(b), 1);
      w.buildings.wallVersion++;
      continue;
    }
    id++;
    k++;
  }
  w.debug.godMode = true;
  w.run.phase = "wave";
  w.waves.number = 4;
  w.waves.size = 100;
  w.waves.paused = true;
  w.special.scheduled = true;
  return w;
}

function force(w: World, kind: "car_alarm" | "stampede"): void {
  const x = w.special.extra;
  x.kind = EVENT_KINDS.indexOf(kind);
  x.wave = w.waves.number;
  x.startFraction = 0;
  w.special.extraDone = false;
}

function noBodyInABox(w: World, label: string): void {
  const z = w.zombies;
  for (let i = 0; i < z.aliveCount; i++) {
    const id = z.aliveIds[i]!;
    const r = balance.zombies.types[["walker", "crawler", "runner", "spitter", "brute", "bloater"][z.type[id]!]!]!.radiusM;
    for (const b of w.obstacles.solids) expect(distBox(z.x[id]!, z.y[id]!, b), `${label}: zombie in ${b.name}`).toBeGreaterThan(r - 0.06);
    for (const b of w.buildings.list) if (b.solid) expect(distBox(z.x[id]!, z.y[id]!, b), `${label}: zombie in barricade ${b.id}`).toBeGreaterThan(r - 0.06);
  }
}

describe("Story 6.8 events fuzz (brief 7)", () => {
  it(`${LAYOUTS} layouts × stages 2–4 × masks: alarm lures reach the car, stampedes finish, no body in a box, no stall`, () => {
    let lured = 0;
    let reached = 0;
    let runs = 0;
    for (let L = 0; L < LAYOUTS; L++) {
      for (const stage of [2, 3, 4]) {
        const mask = MASKS[(L * 7 + stage * 3) % MASKS.length]!;
        const label = `layout ${L} stage ${stage} mask ${mask}`;
        // car alarm: the team in a corner, 24 zombies round the map; sound it at once
        const w = layout(100 + L, stage, mask);
        addPlayer(w, "p0", 24, 16);
        force(w, "car_alarm");
        tickN(w, 1);
        expect(w.special.active.phase, label).toBe(EVENT_PHASE.ARMED);
        const car = { ...w.special.carAlarm };
        for (const p of w.players.values()) {
          p.x = 1;
          p.y = car.minY < 16 ? 31 : 1; // far from the car, out of distraction range
        }
        const cx = (car.minX + car.maxX) / 2;
        const cy = (car.minY + car.maxY) / 2;
        const ids: number[] = [];
        const rng = createRng(L * 31 + stage);
        for (let k = 0, tries = 0; k < 16 && tries < 300; tries++) {
          const a = rng.range(0, Math.PI * 2);
          const d = rng.range(4, 13);
          const x = cx + Math.cos(a) * d;
          const y = cy + Math.sin(a) * d;
          if (x < 1 || y < 1 || x > 47 || y > 31) continue;
          if (w.obstacles.solids.some((b) => distBox(x, y, b) < 0.6) || w.buildings.list.some((b) => distBox(x, y, b) < 0.6)) continue;
          const id = spawnZombie(w, k % 5 === 4 ? "brute" : "walker", x, y, true);
          if (id >= 0) ids.push(id);
          k++;
        }
        tickN(w, 30); // the lure fields build
        w.special.active.phaseTick = w.tick - 400;
        tickN(w, 1);
        expect(w.special.active.phase, label).toBe(EVENT_PHASE.ALARM);
        for (let t = 0; t < 20 * 14; t++) {
          tickN(w, 1);
          if (t % 10 === 0) noBodyInABox(w, label);
        }
        for (const id of ids) {
          if (w.zombies.alivePos[id]! < 0) continue;
          lured++;
          if (distBox(w.zombies.x[id]!, w.zombies.y[id]!, car) < 2.5) reached++;
        }
        runs++;
        // stampede on the same layout
        const s = layout(200 + L, stage, mask);
        addPlayer(s, "p0", 24, 16);
        addPlayer(s, "p1", 25, 16);
        force(s, "stampede");
        for (let t = 0; t < 20 * 15 && !(t > 2 && s.special.active.kind === -1); t++) {
          tickN(s, 1);
          if (t % 5 === 0) noBodyInABox(s, `${label} stampede`);
        }
        expect(s.special.active.kind, `${label}: the stampede ended`).toBe(-1);
        const log = s.special.log;
        expect(log.stampedeSpawned).toBe(18);
        expect(log.stampedeExited + log.stampedeConverted).toBe(18);
        let left = 0;
        for (let i = 0; i < s.zombies.aliveCount; i++) if (s.zombies.state[s.zombies.aliveIds[i]!] === ZOMBIE_STATE.STAMPEDE) left++;
        expect(left).toBe(0);
      }
    }
    console.info(`[events fuzz] ${runs} alarms: ${reached}/${lured} lured zombies within 2.5 m of the car at the end`);
    expect(lured).toBeGreaterThan(runs * 8); // liveness
    expect(reached / lured).toBeGreaterThan(0.9);
  }, 300_000);
});
