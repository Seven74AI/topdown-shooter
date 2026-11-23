import { describe, expect, it } from "vitest";
import {
  COVER_KINDS,
  NO_SYSTEMS,
  PLACEHOLDER_MAP,
  REWIND_MAX_TICKS,
  TICK_DT_S,
  NEUTRAL_INPUT,
  addPlayer,
  createWorld,
  decodeNetEvent,
  encodeNetEvent,
  loadBalance,
  setInput,
  setLoadout,
  spawnZombie,
  step,
  zombieNetId,
  type CoverKind,
  type DistrictMap,
  type SimEvent,
} from "@topdown/shared";
import { CosmeticProjectiles } from "./cosmeticProjectiles";

const balance = loadBalance();
const FRAME = 1 / 60;

function setup() {
  const world = createWorld({ balance, seed: 0, systems: NO_SYSTEMS });
  const seen: number[] = [];
  const c = new CosmeticProjectiles(world, "p0", (id) => seen.push(id));
  return { world, c, seen };
}

const fly = (c: CosmeticProjectiles, frames: number) => {
  for (let i = 0; i < frames; i++) c.update(FRAME);
};

describe("CosmeticProjectiles (Story 2.7)", () => {
  it("a Pistol shot stops at the first mirror zombie and reports it once", () => {
    const { world, c, seen } = setup();
    const a = spawnZombie(world, "walker", 14, 16);
    spawnZombie(world, "walker", 16, 16);
    c.spawn("p0", "pistol", 10, 16, 1, 0);
    fly(c, 30);
    expect(world.projectiles.aliveCount).toBe(0);
    expect(seen).toEqual([zombieNetId(a, world.zombies.generation[a] as number)]);
  });

  it("a Hunting Rifle shot passes through 5 zombies and stops at the 5th", () => {
    const { world, c, seen } = setup();
    for (let i = 0; i < 6; i++) spawnZombie(world, "walker", 12 + i, 16);
    c.spawn("p0", "hunting_rifle", 10, 16, 1, 0);
    fly(c, 60);
    expect(seen).toHaveLength(5);
    expect(world.projectiles.aliveCount).toBe(0);
    expect(world.projectiles.x[0]).toBeLessThan(17);
  });

  it("is freed at its range and draws without lerp (prevX = x)", () => {
    const { world, c } = setup();
    const id = c.spawn("p0", "pistol", 10, 16, 1, 0);
    c.update(FRAME);
    expect(world.projectiles.prevX[id]).toBe(world.projectiles.x[id]);
    expect(world.projectiles.x[id]).toBeCloseTo(11, 5); // 60 m/s × 1/60 s
    fly(c, 20);
    expect(world.projectiles.aliveCount).toBe(0);
    expect(world.projectiles.x[id]).toBeCloseTo(10 + (balance.weapons.pistol?.rangeM ?? 0), 4);
  });

  it("never changes a mirror zombie's HP or position, and others' shots report nothing", () => {
    const { world, c, seen } = setup();
    const z = spawnZombie(world, "walker", 14, 16);
    const hp = world.zombies.hp[z];
    c.spawn("p1", "smg", 10, 16, 1, 0);
    c.spawn("p0", "pistol", 10, 16, 1, 0);
    fly(c, 30);
    expect(world.zombies.hp[z]).toBe(hp);
    expect([world.zombies.x[z], world.zombies.y[z]]).toEqual([14, 16]);
    expect(world.zombies.aliveCount).toBe(1);
    expect(seen).toHaveLength(1); // only mine
  });

  it("does not spawn melee weapons and clear() frees everything", () => {
    const { world, c } = setup();
    expect(c.spawn("p0", "machete", 10, 16, 1, 0)).toBe(-1);
    c.spawn("p0", "pistol", 10, 16, 1, 0);
    c.spawn("p0", "pistol", 10, 17, 1, 0);
    c.clear();
    expect(world.projectiles.aliveCount).toBe(0);
  });
});

describe("CosmeticProjectiles vs cover (Story 4.2)", () => {
  const withCover = (kind: CoverKind) => {
    const map: DistrictMap = { ...PLACEHOLDER_MAP, name: "cover-cosmetic", cover: [{ name: "c", kind, minStage: 1, minX: 12, minY: 15, maxX: 14, maxY: 17 }] };
    const world = createWorld({ balance, seed: 0, map, systems: NO_SYSTEMS });
    const seen: number[] = [];
    const c = new CosmeticProjectiles(world, "p0", (id) => seen.push(id));
    return { world, c, seen };
  };

  for (const kind of COVER_KINDS) {
    const stops = kind === "car" || kind === "bus";
    it(`${kind}: ${stops ? "my cosmetic shot (and a turret's) stops at its face, no apparent hit behind it" : "my cosmetic shot flies over it and reports the zombie behind"}`, () => {
      const { world, c, seen } = withCover(kind);
      spawnZombie(world, "walker", 16, 16);
      c.spawn("p0", "hunting_rifle", 10, 16, 1, 0);
      let maxX = 0;
      for (let i = 0; i < 60; i++) {
        c.update(FRAME);
        if (world.projectiles.aliveCount > 0) maxX = Math.max(maxX, world.projectiles.x[world.projectiles.aliveIds[0] as number] as number);
      }
      expect(world.projectiles.aliveCount).toBe(0);
      expect(seen).toHaveLength(stops ? 0 : 1);
      expect(c.coverStops).toBe(stops ? 1 : 0);
      if (stops) {
        expect(world.projectiles.x[0]).toBeCloseTo(12, 4); // ended on the face
        expect(maxX).toBeLessThanOrEqual(12 + 1e-4);
        c.spawnShot(1, "auto_turret", 10, 16, 1, 0, 40, 8);
        fly(c, 30);
        expect(c.coverStops).toBe(2);
      }
    });
  }
});

describe("CosmeticProjectiles: Shotgun pellets (Story 5.3, F6)", () => {
  it("a remote shotgun event spawns 8 pellets with the server's directions (through the wire)", () => {
    // The server: online (lag compensation on), p1 fires one Shotgun shell on seq 70,001.
    const server = createWorld({ balance, seed: 3, systems: { waves: () => {} } });
    const p = addPlayer(server, "p1", 10, 16);
    setLoadout(balance, p.loadout, ["shotgun", null]);
    p.rewindMaxTicks = REWIND_MAX_TICKS;
    const events: SimEvent[] = [];
    server.events.subscribe((e) => events.push(e));
    setInput(server, "p1", { ...NEUTRAL_INPUT, seq: 70_001, aimX: 0.6, aimY: -0.8, fire: true, isMouse: true });
    step(server, TICK_DT_S);
    const fired = events.find((e) => e.type === "weapon.fired");
    if (!fired) throw new Error("no shot");
    const pool = server.projectiles;
    const serverDirs = Array.from({ length: pool.aliveCount }, (_, i) => Math.atan2(pool.dirY[pool.aliveIds[i] as number] as number, pool.dirX[pool.aliveIds[i] as number] as number)).sort();
    expect(serverDirs).toHaveLength(8);
    // The wire: a remote client decodes it (heading quantized) and spawns the fan.
    const wire = encodeNetEvent(fired, { balance });
    const remote = wire ? decodeNetEvent(wire, { balance }) : null;
    if (!remote || remote.type !== "weapon.fired") throw new Error("not decoded");
    const { world, c } = setup();
    c.spawn(remote.playerId, remote.weapon, remote.x, remote.y, remote.dirX, remote.dirY, remote.seq ?? -1);
    const cp = world.projectiles;
    expect(cp.aliveCount).toBe(8);
    const clientDirs = Array.from({ length: cp.aliveCount }, (_, i) => Math.atan2(cp.dirY[cp.aliveIds[i] as number] as number, cp.dirX[cp.aliveIds[i] as number] as number)).sort();
    // Same per-pellet rolls; the centre aim is the event's heading, quantized to 256 steps (≤ 0.71°).
    clientDirs.forEach((a, k) => expect(Math.abs(a - (serverDirs[k] as number))).toBeLessThanOrEqual(Math.PI / 256 + 1e-6));
    // And the unquantized centre (my own shot) gives the exact fan.
    const mine = setup();
    mine.c.spawn("p1", "shotgun", fired.x, fired.y, fired.dirX, fired.dirY, 70_001 & 0xffff);
    const mp = mine.world.projectiles;
    const mineDirs = Array.from({ length: 8 }, (_, i) => Math.atan2(mp.dirY[mp.aliveIds[i] as number] as number, mp.dirX[mp.aliveIds[i] as number] as number)).sort();
    mineDirs.forEach((a, k) => expect(a).toBeCloseTo(serverDirs[k] as number, 5));
  });

  it("pellets stop at the mirror's car face, the zombie behind is never an apparent hit", () => {
    const map: DistrictMap = { ...PLACEHOLDER_MAP, name: "sg-car", cover: [{ name: "car", kind: "car", minStage: 1, minX: 12, minY: 14, maxX: 13, maxY: 18 }] };
    const world = createWorld({ balance, seed: 0, map, systems: NO_SYSTEMS });
    const seen: number[] = [];
    const c = new CosmeticProjectiles(world, "p0", (id) => seen.push(id));
    spawnZombie(world, "walker", 13.6, 16);
    c.spawn("p0", "shotgun", 10.5, 16, 1, 0, 42);
    expect(world.projectiles.aliveCount).toBe(8);
    fly(c, 30);
    expect(world.projectiles.aliveCount).toBe(0);
    expect(seen).toEqual([]);
    expect(c.coverStops).toBe(8);
  });

  it("a single-pellet gun still spawns one projectile (the Assault Rifle)", () => {
    const { world, c } = setup();
    c.spawn("p0", "assault_rifle", 10, 16, 1, 0, 5);
    expect(world.projectiles.aliveCount).toBe(1);
    expect(world.projectiles.dirX[world.projectiles.aliveIds[0] as number]).toBe(1);
  });
});
