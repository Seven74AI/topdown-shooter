import { DEG_TO_RAD, rotate } from "../math/vec";

/**
 * Story 2.12: the online spread roll of a shot, a pure function of the shooter's id and the input
 * seq that fired it, uniform in [-1, 1). The server (with lag compensation) and the shooter's
 * client both use it, so the cosmetic bullet flies exactly where the server's does: 2.7 rolled them
 * independently, which alone reversed ~3.6 % of Pistol hits on kiting Runners once the rewind fixed
 * the timing. Offline, the World's `combat` stream rolls (Story 4.4). At most one shot per seq
 * (every gun fires ≤ 20/s); a multi-pellet weapon adds the pellet index (`seqPelletRoll`, Story 5.3). Allocation-free.
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

/**
 * Story 5.3: the online roll of pellet `k` of the shot fired on input `seq`, in [0, 1): the same
 * FNV-1a + murmur3 hash as `seqSpreadRoll` with the pellet index mixed in. Keyed on `seq & 0xffff`
 * so the 16-bit seq a remote client gets with `weapon.fired` rebuilds the exact fan (decision D3).
 * Allocation-free.
 */
export function seqPelletRoll(playerId: string, seq: number, k: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < playerId.length; i++) {
    h ^= playerId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= seq & 0xffff;
  h = Math.imul(h, 0x01000193);
  h ^= (k + 1) & 0xff;
  h = Math.imul(h, 0x01000193);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

/**
 * Story 5.3 fairness rule F1 (stratified fan): the `spreadDeg` cone around the unit aim is cut into
 * `pellets` equal slices and pellet `k` flies inside slice k, at `u` ∈ [0, 1) across it. So the fan
 * always covers the whole cone: a body right at the muzzle takes every pellet. The ONE pellet
 * direction function: the server (`tryFire`), the client's cosmetic pellets and the netsim harness
 * all call it. Writes the unit direction into `out`; allocation-free.
 */
export function pelletDirection(
  dirX: number,
  dirY: number,
  spreadDeg: number,
  pellets: number,
  k: number,
  u: number,
  out: { x: number; y: number },
): void {
  const angle = (-spreadDeg / 2 + ((k + u) * spreadDeg) / pellets) * DEG_TO_RAD;
  rotate(dirX, dirY, angle, out);
}
