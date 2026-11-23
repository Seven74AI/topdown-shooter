import type { Balance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { createWorld, setInput, step, type World } from "../core/world";
import type { PlayerInput } from "../net/input";
import { addPlayer } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { buyItem, buyWeapon, upgradeWeapon } from "../economy/shop";
import { placeBuilding } from "../buildings/buildings";
import type { DistrictMap } from "../map/districtMap";
import { DOWNTOWN_MAP } from "../map/downtown";
import { setBuildReady, startBuild } from "../run/runStateMachine";

/**
 * Story 4.4 (NFR10): headless replay. A run is its seed plus an input log: every player input and
 * every build action (buy, place, Ready; Story 5.1: upgrade), each stamped with the World tick before whose `step()` it
 * was applied. `replayRun` rebuilds the World from the seed and applies the log in order; with the
 * named seed streams (`core/seedStreams.ts`) it reaches the same `worldDigest`. Tests and tools only
 * (allocates freely).
 */
export type BuildCommand =
  | { kind: "buy"; playerId: string; weapon: string; slot: 0 | 1 | null }
  | { kind: "place"; playerId: string; type: string; gx: number; gy: number; rot: number }
  | { kind: "ready"; playerId: string; ready: boolean }
  /** Story 5.1: a weapon upgrade (`upgradeWeapon`). */
  | { kind: "upgrade"; playerId: string; weapon: string }
  /** Story 5.11: a shop item (`buyItem`: gear; Story 5.12 consumables). */
  | { kind: "item"; playerId: string; item: string };

export type ReplayCommand = ({ kind: "input"; playerId: string; input: PlayerInput } | BuildCommand) & { tick: number };

export interface InputLog {
  seed: number;
  /** Players `p0` … `p<players − 1>` (slot = index), placed like the server's run start. */
  players: number;
  /** The World tick the recording stopped at (the replay steps until it). */
  endTick: number;
  commands: ReplayCommand[];
}

export function createInputLog(seed: number, players: number): InputLog {
  return { seed: seed >>> 0, players, endTick: 0, commands: [] };
}

/**
 * The run start shared by the recorder (`runHeadless`) and `replayRun`: players `p0`… at their team
 * spawn points (slot order), then lobby → the first build phase.
 */
export function createHeadlessWorld(balance: Balance, seed: number, players: number, map: DistrictMap = DOWNTOWN_MAP): { world: World; ids: string[] } {
  const world = createWorld({ balance, seed, map }); // Story 4.1: the game's map (recorder and replay alike)
  const at = { x: 0, y: 0 };
  const ids: string[] = [];
  for (let slot = 0; slot < players; slot++) {
    const id = `p${slot}`;
    ids.push(id);
    teamSpawnPoint(world, slot, at);
    addPlayer(world, id, at.x, at.y);
  }
  startBuild(world);
  return { world, ids };
}

/** Applies one logged command to the World (the same calls the recorder made). */
export function applyCommand(world: World, cmd: ReplayCommand): void {
  switch (cmd.kind) {
    case "input":
      setInput(world, cmd.playerId, { ...cmd.input });
      break;
    case "buy":
      buyWeapon(world, cmd.playerId, cmd.weapon, cmd.slot);
      break;
    case "place":
      placeBuilding(world, cmd.playerId, { type: cmd.type, gx: cmd.gx, gy: cmd.gy, rot: cmd.rot });
      break;
    case "ready":
      setBuildReady(world, cmd.playerId, cmd.ready);
      break;
    case "upgrade":
      upgradeWeapon(world, cmd.playerId, cmd.weapon);
      break;
    case "item":
      buyItem(world, cmd.playerId, cmd.item);
      break;
  }
}

export interface ReplayOptions {
  /** Called once right after the run start (before any command), e.g. to draw from a stream. */
  afterStart?: (world: World) => void;
  /** Called before each tick's commands. */
  beforeTick?: (world: World) => void;
}

/** Replays `log` from its seed until `log.endTick`; returns the World. */
export function replayRun(balance: Balance, log: InputLog, opts: ReplayOptions = {}): World {
  const { world } = createHeadlessWorld(balance, log.seed, log.players);
  opts.afterStart?.(world);
  let next = 0;
  const cmds = log.commands;
  while (world.tick < log.endTick) {
    opts.beforeTick?.(world);
    while (next < cmds.length && (cmds[next] as ReplayCommand).tick === world.tick) applyCommand(world, cmds[next++] as ReplayCommand);
    if (next < cmds.length && (cmds[next] as ReplayCommand).tick < world.tick) throw new Error(`replayRun: command for tick ${(cmds[next] as ReplayCommand).tick} out of order`);
    step(world, TICK_DT_S);
  }
  if (next !== cmds.length) throw new Error(`replayRun: ${cmds.length - next} commands after the end tick`);
  return world;
}
