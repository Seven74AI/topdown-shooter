import type { World } from "../core/world";
import { viewRect, type Rect } from "../net/interest";
import { buildingStats, footprint, type Box } from "./buildings";

/**
 * Story 5.24 (BX-10): teammates' ghosts. A player's held building (type, spot, rotation) is relayed
 * by the server to the other players, who draw it as a dashed outline. Cosmetic only (ux-spec F7): it
 * never enters the World or the schema, never blocks anything and never leaves the build phase.
 * This is the server's relay check (silent drops; no refusal message: cosmetic data).
 */

/** Why a ghost is not relayed, in check order. */
export type GhostError = "unknown_player" | "not_alive" | "not_build_phase" | "unknown_type" | "out_of_view";

/**
 * D4: the footprint centre must be inside the sender's own view (the widest camera view, clamped like
 * the camera: `viewRect`) plus this margin (m): a carried or pinned ghost is never farther.
 */
export const GHOST_VIEW_MARGIN_M = 1;

/** A ghost as sent (`type: ""` = the sender's hand is empty). */
export interface GhostRequest {
  readonly type: string;
  readonly gx: number;
  readonly gy: number;
  readonly rot: number;
}

const scratchBox: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const scratchView: Rect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

/**
 * The relay check: unknown player → not standing (a clear `""` passes) → not a build phase →
 * unknown building type → footprint centre outside the sender's view + `GHOST_VIEW_MARGIN_M`.
 * null = relay it. No allocation.
 */
export function ghostError(world: Readonly<World>, playerId: string, g: GhostRequest): GhostError | null {
  const p = world.players.get(playerId);
  if (!p) return "unknown_player";
  const clear = g.type === "";
  if (!clear && p.status !== "alive") return "not_alive";
  if (world.run.phase !== "build") return "not_build_phase";
  if (clear) return null;
  const stats = buildingStats(world.balance, g.type);
  if (!stats) return "unknown_type";
  const b = footprint(stats, g.gx, g.gy, g.rot, scratchBox);
  const v = viewRect(world.map, p.x, p.y, GHOST_VIEW_MARGIN_M, scratchView);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  if (cx < v.minX || cx > v.maxX || cy < v.minY || cy > v.maxY) return "out_of_view";
  return null;
}
