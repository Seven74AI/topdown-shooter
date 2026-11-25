import type { Balance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { createWorld, setInput, step, type World } from "../core/world";
import type { PlayerInput } from "../net/input";
import { addPlayer, removePlayer, type PlayerInit } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { buyItem, upgradeWeapon } from "../economy/shop";
import { buyCard, reroll } from "../economy/shopCards";
import { disownBuildings, placeBuilding } from "../buildings/buildings";
import type { DistrictMap } from "../map/districtMap";
import { DOWNTOWN_MAP } from "../map/downtown";
import { holdPlayer, returnPlayer } from "../player/hold";
import { addLatePlayer } from "../player/lateJoin";
import { castVote, setBuildReady, startBuild, type EvacChoice } from "../run/runStateMachine";

/**
 * Story 4.4 (NFR10): headless replay. A run is its seed plus an input log: every player input and
 * every build action (Story 5.13: card buy and reroll; place, Ready; Story 5.1: upgrade), each stamped with the World tick before whose `step()` it
 * was applied. `replayRun` rebuilds the World from the seed and applies the log in order; with the
 * named seed streams (`core/seedStreams.ts`) it reaches the same `worldDigest`. Tests and tools only
 * (allocates freely).
 */
export type BuildCommand =
  /** Story 5.13: a card purchase (`buyCard`; replaced 3.3's fixed-list `buy`). */
  | { kind: "buyCard"; playerId: string; build: number; rev: number; card: number; item: string; slot: 0 | 1 | null }
  /** Story 5.13: a paid reroll (`reroll`). */
  | { kind: "reroll"; playerId: string; build: number; rev: number }
  | { kind: "place"; playerId: string; type: string; gx: number; gy: number; rot: number }
  | { kind: "ready"; playerId: string; ready: boolean }
  /** Story 5.1: a weapon upgrade (`upgradeWeapon`). */
  | { kind: "upgrade"; playerId: string; weapon: string }
  /** Story 5.11: a shop item (`buyItem`: gear; Story 5.12 consumables). */
  | { kind: "item"; playerId: string; item: string }
  /** Story 6.11: an evacuation vote (`castVote`). */
  | { kind: "vote"; playerId: string; choice: EvacChoice }
  /** Story 8.1 (brief 5): a player went on hold (dropped or quiet) between two steps (`holdPlayer`). */
  | { kind: "hold"; playerId: string }
  /** Story 8.1: a held player came back (`returnPlayer`: placement and protection are the World's). */
  | { kind: "return"; playerId: string }
  /** Story 8.2 (brief 5): a late joiner entered the World in a build phase (`addLatePlayer`: spot, wallet, +15 s once). */
  | { kind: "join"; playerId: string; slot: number; wallet: number }
  /** Story 8.3: the host removed a player (out of the World, their buildings disowned: `removePlayer` + `disownBuildings`). */
  | { kind: "remove"; playerId: string };

export type ReplayCommand = ({ kind: "input"; playerId: string; input: PlayerInput } | BuildCommand) & { tick: number };

export interface InputLog {
  seed: number;
  /** Players `p0` … `p<players − 1>` (slot = index), placed like the server's run start. */
  players: number;
  /** The World tick the recording stopped at (the replay steps until it). */
  endTick: number;
  commands: ReplayCommand[];
  /**
   * Stories 7.4/7.5 (brief 5, 8): the run-start data per slot (unlock mask, Training levels): part of what a replay
   * needs to reach the same digest. Absent = every unlock and Training 0 (the default of tests, bots and sims).
   */
  inits?: PlayerInit[];
}

export function createInputLog(seed: number, players: number): InputLog {
  return { seed: seed >>> 0, players, endTick: 0, commands: [] };
}

/**
 * The run start shared by the recorder (`runHeadless`) and `replayRun`: players `p0`… at their team
 * spawn points (slot order), then lobby → the first build phase.
 */
export function createHeadlessWorld(balance: Balance, seed: number, players: number, map: DistrictMap = DOWNTOWN_MAP, inits?: readonly PlayerInit[]): { world: World; ids: string[] } {
  const world = createWorld({ balance, seed, map }); // Story 4.1: the game's map (recorder and replay alike)
  const at = { x: 0, y: 0 };
  const ids: string[] = [];
  for (let slot = 0; slot < players; slot++) {
    const id = `p${slot}`;
    ids.push(id);
    teamSpawnPoint(world, slot, at);
    addPlayer(world, id, at.x, at.y, inits?.[slot] ?? {}); // Stories 7.4/7.5: the slot's start data
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
    case "buyCard":
      buyCard(world, cmd.playerId, cmd.build, cmd.rev, cmd.card, cmd.item, cmd.slot);
      break;
    case "reroll":
      reroll(world, cmd.playerId, cmd.build, cmd.rev);
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
    case "vote":
      castVote(world, cmd.playerId, cmd.choice);
      break;
    case "hold":
      holdPlayer(world, cmd.playerId);
      break;
    case "return":
      returnPlayer(world, cmd.playerId);
      break;
    case "join":
      addLatePlayer(world, cmd.playerId, cmd.slot, cmd.wallet);
      break;
    case "remove":
      removePlayer(world, cmd.playerId);
      disownBuildings(world, cmd.playerId);
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
  const { world } = createHeadlessWorld(balance, log.seed, log.players, DOWNTOWN_MAP, log.inits);
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
