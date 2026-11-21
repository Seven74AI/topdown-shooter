import type { SystemFn } from "../core/systems";

const MIN_VEC_LEN = 1e-6;

/**
 * Moves every alive player from their input. Runs on the server and in client prediction (Epic 2),
 * so it uses only + − × ÷, sqrt, min and max: no sin/cos/atan2, whose last bits can differ
 * between JavaScript engines and would make prediction drift.
 */
export const updatePlayers: SystemFn = (world, dtS) => {
  const speed = world.balance.player.speedMps;
  const { widthM, heightM } = world.map;
  for (const p of world.players.values()) {
    p.prevX = p.x;
    p.prevY = p.y;
    if (p.status !== "alive") continue;
    const input = world.inputs.get(p.id);
    if (!input) continue;

    let mx = input.moveX;
    let my = input.moveY;
    const moveLen = Math.sqrt(mx * mx + my * my);
    if (moveLen > 1) {
      mx /= moveLen; // the client normalizes; clamp defensively
      my /= moveLen;
    }
    const r = p.radiusM;
    p.x = Math.min(widthM - r, Math.max(r, p.x + mx * speed * dtS));
    p.y = Math.min(heightM - r, Math.max(r, p.y + my * speed * dtS));

    const aimLen = Math.sqrt(input.aimX * input.aimX + input.aimY * input.aimY);
    if (aimLen > MIN_VEC_LEN) {
      p.facingX = input.aimX / aimLen;
      p.facingY = input.aimY / aimLen;
    } else if (moveLen > MIN_VEC_LEN) {
      p.facingX = input.moveX / moveLen;
      p.facingY = input.moveY / moveLen;
    }
  }
};
