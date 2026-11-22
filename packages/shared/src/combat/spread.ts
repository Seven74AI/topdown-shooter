import { DEG_TO_RAD, rotate } from "../math/vec";

/**
 * Story 2.12: the online spread roll of a shot, a pure function of the shooter's id and the input
 * seq that fired it, uniform in [-1, 1). The server (with lag compensation) and the shooter's
 * client both use it, so the cosmetic bullet flies exactly where the server's does: 2.7 rolled them
 * independently, which alone reversed ~3.6 % of Pistol hits on kiting Runners once the rewind fixed
 * the timing. Offline, the World's rng rolls as before (solo unchanged). At most one shot per seq
 * (every gun fires ≤ 20/s); a multi-pellet weapon would add the pellet index. Allocation-free.
 */
export function seqSpreadRoll(playerId: string, seq: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < playerId.length; i++) {
    h ^= playerId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= seq >>> 0;
  h = Math.imul(h, 0x01000193);
  // murmur3 finaliser: the low bits of nearby seqs spread over the whole range
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x80000000 - 1;
}

/**
 * Story 2.12 review M2: the one place that turns a unit aim into the seq's spread direction
 * (`spreadDeg` wide), written into `out`. The server's online shot, the client's cosmetic shot
 * (NetSimHost) and the netsim harness all call this, so they can't drift apart.
 */
export function rotateBySeqSpread(
  dirX: number,
  dirY: number,
  playerId: string,
  seq: number,
  spreadDeg: number,
  out: { x: number; y: number },
): void {
  rotate(dirX, dirY, seqSpreadRoll(playerId, seq) * ((spreadDeg / 2) * DEG_TO_RAD), out);
}
