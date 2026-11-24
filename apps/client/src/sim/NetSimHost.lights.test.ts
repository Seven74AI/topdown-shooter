import { describe, expect, it } from "vitest";
import { BUILD_GRID_M, DOWNTOWN_MAP, addBuildingAt, addPlayer, createWorld, damageBuilding, lightsOf, loadBalance, skipWave, startBuild, startWave, step, teamSpawnPoint, type World } from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";

/**
 * Story 5.10 (AC 2, B14): the light-source list is DERIVED on every copy. The client mirror builds it
 * from the synced buildings and decay fields and must equal the server World's after a place, a
 * destroy, a fire going out, a tab that slept across a build start, and a late join.
 */
const balance = loadBalance();

function serverRun(seed = 8): { s: World; at: { x: number; y: number } } {
  const s = createWorld({ balance, seed, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
  s.debug.godMode = true;
  s.debug.decayStageByWave = [1, 3, 3, 3, 3];
  const at = { x: 0, y: 0 };
  teamSpawnPoint(s, 0, at);
  addPlayer(s, "p0", at.x, at.y);
  startBuild(s);
  return { s, at };
}
function nextBuild(w: World): void {
  startWave(w);
  step(w, 0.05);
  skipWave(w);
  step(w, 0.05);
}
let nextId = 1;
function placeFlood(s: World, x: number, y: number): void {
  addBuildingAt(s, { id: nextId++, type: "floodlight", ownerId: "p0", gx: Math.round(x / BUILD_GRID_M), gy: Math.round(y / BUILD_GRID_M), rot: 0, hp: 150 });
  step(s, 0.05);
}

/** The room state as the server's schema would carry it (buildings map + the decay fields). */
function copyState(s: World, room: FakeRoom, tick: number): void {
  room.state.tick = tick;
  room.state.phase = s.run.phase;
  room.state.decayStage = s.decay.stage;
  room.state.decayVariants = s.decay.variants;
  room.state.decayFiresOut = s.decay.firesOut;
  room.state.buildings.clear();
  for (const b of s.buildings.list) room.state.buildings.set(String(b.id), { type: b.type, owner: b.ownerId, gx: b.gx, gy: b.gy, rot: b.rot, hp: Math.ceil(b.hp), trap: b.trapState });
}
function client(s: World, tick: number) {
  const room = new FakeRoom(fakeState([fakePlayer(0, { x: 24, y: 16 })]));
  copyState(s, room, tick);
  const session = new NetSession(room, { playerId: "p0", slot: 0, tickRateHz: 20 }, () => {});
  let now = 0;
  const host = new NetSimHost({ balance, session, now: () => now });
  return { room, host, setNow: (t: number) => (now = t) };
}
const plain = (w: World) => lightsOf(w).map((l) => ({ ...l }));
/**
 * Review L2: the mirror's list as it stands right after the state was applied — read straight from
 * `world.lights.list`, NOT through `lightsOf` (which would refresh it), so this checks that
 * `mirrorBuildings` / `applyDecayStage` really updated it themselves.
 */
const raw = (w: World) => w.lights.list.map((l) => ({ ...l }));

describe("NetSimHost light list (Story 5.10)", () => {
  it("equals the server's after a place, a destroy, fires lit and fires out", () => {
    const { s, at } = serverRun();
    placeFlood(s, at.x + 3, at.y);
    placeFlood(s, at.x - 3, at.y);
    const { room, host } = client(s, 1);
    room.patch();
    host.update(1 / 60);
    expect(raw(host.world)).toEqual(plain(s));
    expect(lightsOf(host.world).filter((l) => l.kind === "floodlight")).toHaveLength(2); // liveness
    // destroy one
    damageBuilding(s, s.buildings.list[0] as never, 10_000);
    step(s, 0.05);
    copyState(s, room, 2);
    room.patch();
    host.update(1 / 60);
    expect(raw(host.world)).toEqual(plain(s));
    expect(lightsOf(host.world)).toHaveLength(1);
    // the build start before wave 2: stage 3, the car fires are lights too
    nextBuild(s);
    expect(s.decay.fires.length).toBeGreaterThan(0);
    copyState(s, room, 3);
    room.patch();
    host.update(1 / 60);
    expect(raw(host.world)).toEqual(plain(s));
    expect(lightsOf(host.world).filter((l) => l.kind === "fire").length).toBe(s.decay.fires.length);
    // two waves later they go out
    nextBuild(s);
    nextBuild(s);
    expect(s.decay.fires).toEqual([]);
    copyState(s, room, 4);
    room.patch();
    host.update(1 / 60);
    expect(raw(host.world)).toEqual(plain(s));
    expect(lightsOf(host.world).every((l) => l.kind === "floodlight")).toBe(true);
  });

  it("a tab that slept across the build start that lit the fires wakes with the server's list (late patches)", () => {
    const { s, at } = serverRun(13);
    placeFlood(s, at.x + 3, at.y);
    const { room, host, setNow } = client(s, 10);
    room.patch();
    host.update(1 / 60);
    expect(raw(host.world)).toEqual(plain(s));
    nextBuild(s);
    placeFlood(s, at.x - 3, at.y);
    for (let t = 11; t <= 200; t++) {
      if (t === 120) copyState(s, room, t);
      else room.state.tick = t;
      room.patch();
    }
    setNow(10_000);
    host.update(10);
    host.update(0.05);
    expect(raw(host.world)).toEqual(plain(s));
    expect(lightsOf(host.world).length).toBeGreaterThan(2);
  });

  it("a late join (a new client on a run with lights and fires) derives the same list at once", () => {
    const { s, at } = serverRun(21);
    nextBuild(s);
    placeFlood(s, at.x + 3, at.y);
    placeFlood(s, at.x, at.y + 3);
    const { room, host } = client(s, 50);
    room.patch();
    host.update(1 / 60);
    expect(raw(host.world)).toEqual(plain(s));
    expect(lightsOf(host.world).length).toBe(s.decay.fires.length + 2);
  });
});
