/**
 * Network audit 2026-11: what would other horde-stream encodings cost on REAL zombie movement?
 * Not game code; not a test. Runs the real server RunController (Downtown, every system but waves)
 * with 4 survivors walking circles round the map centre (pessimistic: the horde never settles),
 * 150 zombies of the late-wave mix (god mode), and for player p0's view measures per tick:
 *
 *  A  today:       the real HordeEncoder frame (6 + 8 B per zombie in view + margin), 20 Hz.
 *  B  delta:       vs the previous frame sent to this client (safe on TCP: it always arrived):
 *                  new-in-view = 8 B full record; changed = 1 B slot + 1 B mask + 2 B (int8 cm dx, dy)
 *                  or 4 B (absolute) + 1 B heading if changed + 1 B type/state if changed; unchanged = 0 B;
 *                  left view or died = 1 B slot. Header 6 B + 2 B counts.
 *  C  delta, no heading: like B, but the client derives heading from movement (no heading bytes).
 *  D  delta + far at 10 Hz: like C, but zombies > NEAR_M from the viewer update every 2nd tick.
 *  E  today at 10 Hz: A sent every 2nd tick.
 *
 *   npx tsx tools/netaudit/hordeEncodings.ts [ticks=600]
 */
import {
  DOWNTOWN_MAP,
  POS_SCALE,
  ZOMBIE_TYPES,
  loadBalance,
  packTypeState,
  quantizeHeading,
  queryRect,
  spawnZombie,
  viewRect,
  wireState,
  zombieNetId,
  createRng,
  type Rect,
  type ZombieTypeId,
} from "@topdown/shared";
import { RunController } from "../../apps/server/src/run/RunController";
import { HordeEncoder, newHordeStats } from "../../apps/server/src/net/hordeEncoder";

const TICKS = Number(process.argv[2] ?? 600);
const WARMUP = 100;
const NEAR_M = 8;
const ZOMBIES = 150;
/** Late-wave mix (waves.json wave 6 without the walker-heavy start): walker, runner, crawler, spitter, bloater. */
const MIX: ZombieTypeId[] = ["walker", "walker", "walker", "walker", "runner", "runner", "crawler", "crawler", "spitter", "bloater"];

const balance = loadBalance();
const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
const ctrl = new RunController({ balance, seed: 7, players, systems: { waves: () => {} }, map: DOWNTOWN_MAP });
const world = ctrl.world;
world.debug.godMode = true;
const rng = createRng(11);
const cx = world.map.widthM / 2;
const cy = world.map.heightM / 2;
let spawned = 0;
/** Keeps the horde at the 150-alive cap like the wave director does (kills by Bloater blasts are refilled on a ring). */
function topUp(): void {
  while (world.zombies.aliveCount < ZOMBIES) {
    const a = rng.range(0, 2 * Math.PI);
    const d = rng.range(8, 20);
    const x = Math.min(world.map.widthM - 1, Math.max(1, cx + Math.cos(a) * d));
    const y = Math.min(world.map.heightM - 1, Math.max(1, cy + Math.sin(a) * d));
    if (spawnZombie(world, MIX[spawned++ % MIX.length] as ZombieTypeId, x, y) < 0) return;
  }
}
topUp();

const encoder = new HordeEncoder();
let lastLen = 0;
const fakeClient = {
  state: 1, // ClientState.JOINED
  ref: { bufferedAmount: 0 },
  sendBytes: (_t: number, b: Uint8Array) => {
    lastLen = b.length;
  },
};

interface Rec {
  x: number;
  y: number;
  h: number;
  ts: number;
}
/** Per net id: what the client last received (B/C) and, for D, what it last received for that zombie. */
const prevB = new Map<number, Rec>();
const prevD = new Map<number, Rec>();
const prevC = new Map<number, Rec>();
const ids = new Int32Array(256);
const rect: Rect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const totals = { A: 0, B: 0, C: 0, D: 0, E: 0, inView: 0, frames: 0, moving: 0 };

function deltaCost(prev: Map<number, Rec>, cur: Map<number, Rec>, withHeading: boolean, skip: (netId: number) => boolean): number {
  let bytes = 8; // header (tick u32 + counts)
  for (const [id, r] of cur) {
    const p = prev.get(id);
    if (!p) {
      bytes += 8;
      prev.set(id, { ...r });
      continue;
    }
    if (skip(id)) continue; // not updated this tick (D's far zombies on odd ticks)
    const dx = r.x - p.x;
    const dy = r.y - p.y;
    const moved = dx !== 0 || dy !== 0;
    const hChg = withHeading && r.h !== p.h;
    const tChg = r.ts !== p.ts;
    if (!moved && !hChg && !tChg) continue;
    bytes += 2 + (moved ? (Math.abs(dx) <= 127 && Math.abs(dy) <= 127 ? 2 : 4) : 0) + (hChg ? 1 : 0) + (tChg ? 1 : 0);
    p.x = r.x;
    p.y = r.y;
    p.h = r.h;
    p.ts = r.ts;
  }
  for (const id of [...prev.keys()]) {
    if (!cur.has(id)) {
      bytes += 1;
      prev.delete(id);
    }
  }
  return bytes;
}

for (let t = 0; t < WARMUP + TICKS; t++) {
  // The team walks a 5 m circle (one lap ≈ 10 s), each survivor a quarter apart.
  let k = 0;
  for (const p of world.players.values()) {
    const a = (t / 200) * 2 * Math.PI + (k++ * Math.PI) / 2;
    p.prevX = p.x;
    p.prevY = p.y;
    p.x = cx + Math.cos(a) * 5;
    p.y = cy + Math.sin(a) * 5;
  }
  topUp();
  ctrl.tick();
  const z = world.zombies;
  encoder.prepare(world);
  if (t < WARMUP) continue;
  const me = world.players.get("p0");
  if (!me) throw new Error("no p0");
  encoder.send(world, fakeClient, newHordeStats(), me.x, me.y);
  totals.A += lastLen;
  if (t % 2 === 0) totals.E += lastLen;
  // The same view set as the encoder (rushers aside: the wave director is off here).
  const r = viewRect(world.map, me.x, me.y, 4, rect);
  const n = queryRect(world.zombieGrid, z.x, z.y, r.minX, r.minY, r.maxX, r.maxY, ids);
  const cur = new Map<number, Rec>();
  for (let i = 0; i < n; i++) {
    const id = ids[i] as number;
    const dx = (z.x[id] as number) - (z.prevX[id] as number);
    const dy = (z.y[id] as number) - (z.prevY[id] as number);
    if (dx * dx + dy * dy > 1e-8) totals.moving++;
    cur.set(zombieNetId(id, z.generation[id] as number), {
      x: Math.round((z.x[id] as number) * POS_SCALE),
      y: Math.round((z.y[id] as number) * POS_SCALE),
      h: quantizeHeading(dx, dy),
      ts: packTypeState(z.type[id] as number, wireState(z.state[id] as number, (z.igniteTicks[id] as number) > 0)),
    });
  }
  totals.inView += n;
  totals.frames++;
  totals.B += deltaCost(prevB, cur, true, () => false);
  totals.C += deltaCost(prevC, cur, false, () => false);
  const far = new Set<number>();
  for (const [id, rec] of cur) if (Math.hypot(rec.x / POS_SCALE - me.x, rec.y / POS_SCALE - me.y) > NEAR_M) far.add(id);
  totals.D += deltaCost(prevD, cur, false, (id) => t % 2 === 1 && far.has(id));
}

const kbps = (bytesTotal: number): number => Math.round(((bytesTotal / totals.frames) * 20 * 10) / 1024) / 10;
const frames = totals.frames;
process.stdout.write(
  JSON.stringify(
    {
      ticks: frames,
      zombiesAlive: world.zombies.aliveCount,
      zombiesSpawned: spawned,
      avgInView: Math.round((10 * totals.inView) / frames) / 10,
      movingPct: Math.round((1000 * totals.moving) / Math.max(1, totals.inView)) / 10,
      types: ZOMBIE_TYPES,
      KBps: { A_today: kbps(totals.A), B_delta: kbps(totals.B), C_delta_noHeading: kbps(totals.C), D_delta_far10Hz: kbps(totals.D), E_today10Hz: kbps(totals.E) },
      perZombieInViewBytesPerTick: {
        A: Math.round((100 * (totals.A - 6 * frames)) / totals.inView) / 100,
        B: Math.round((100 * (totals.B - 8 * frames)) / totals.inView) / 100,
        C: Math.round((100 * (totals.C - 8 * frames)) / totals.inView) / 100,
        D: Math.round((100 * (totals.D - 8 * frames)) / totals.inView) / 100,
      },
      worstCase150InView: { A_KBps: Math.round(((6 + 8 * 150) * 20 * 10) / 1024) / 10 },
    },
    null,
    1,
  ) + "\n",
);
