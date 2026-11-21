import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { createWorld, setInput, step } from "../core/world";
import { TICK_DT_S } from "../config/constants";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer, removePlayer } from "./player";
import { teamSpawnPoint } from "./spawn";

const balance = loadBalance();

describe("teamSpawnPoint", () => {
  it("puts slots 0–3 at the centre ± spawnOffsetM (−−, +−, −+, ++)", () => {
    const world = createWorld({ balance, seed: 1 });
    const d = balance.player.spawnOffsetM;
    expect(d).toBe(1.5);
    const cx = world.map.widthM / 2;
    const cy = world.map.heightM / 2;
    const out = { x: 0, y: 0 };
    const at = (slot: number) => ({ ...teamSpawnPoint(world, slot, out) });
    expect(at(0)).toEqual({ x: cx - d, y: cy - d });
    expect(at(1)).toEqual({ x: cx + d, y: cy - d });
    expect(at(2)).toEqual({ x: cx - d, y: cy + d });
    expect(at(3)).toEqual({ x: cx + d, y: cy + d });
    expect(teamSpawnPoint(world, 0, out)).toBe(out);
  });
});

describe("removePlayer", () => {
  it("deletes the player and every input record of theirs", () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
    addPlayer(world, "p0", 10, 10);
    addPlayer(world, "p1", 12, 10);
    setInput(world, "p0", { ...NEUTRAL_INPUT, seq: 1 });
    setInput(world, "p1", { ...NEUTRAL_INPUT, seq: 1 });
    step(world, TICK_DT_S);
    removePlayer(world, "p0");
    expect(world.players.has("p0")).toBe(false);
    expect(world.pendingInputs.has("p0")).toBe(false);
    expect(world.inputs.has("p0")).toBe(false);
    expect(world.lastAppliedSeq.has("p0")).toBe(false);
    expect(world.players.has("p1")).toBe(true);
    removePlayer(world, "nobody"); // no-op
    step(world, TICK_DT_S);
    expect(world.inputs.has("p0")).toBe(false);
  });
});
