/**
 * Story 10.3 (deferred-work D13): what the shared simulation allocates per tick, headless (no browser, no renderer).
 * 150 Walkers round one god-mode survivor who holds fire at the nearest one (the `?stress=150&stressfire=1` scene),
 * stepped at 20 Hz; V8's sampling heap profiler (every allocation, collected or not) over 10 s of game time after a
 * 5 s warm-up. Prints the MB allocated per 10 s and the top functions.
 *
 *   npx tsx tools/perf/simAlloc.ts [stage=1] [ticks=200]
 */
import { Session } from "node:inspector/promises";
import { DOWNTOWN_MAP, NEUTRAL_INPUT, addPlayer, changeDecayStage, createWorld, loadBalance, setInput, spawnZombie, step, type PlayerInput, type World } from "@topdown/shared";

const stage = Number(process.argv[2] ?? 1);
const ticks = Number(process.argv[3] ?? 200);
const world: World = createWorld({ balance: loadBalance(), seed: 7, map: DOWNTOWN_MAP });
world.debug.godMode = true;
world.waves.paused = true;
if (stage > 1) changeDecayStage(world, stage);
const px = DOWNTOWN_MAP.widthM / 2;
const py = DOWNTOWN_MAP.heightM / 2;
addPlayer(world, "p1", px, py);
for (let i = 0; i < 150; i++) {
  const a = (i / 150) * Math.PI * 2;
  const r = 4 + (i % 5) * 1.5;
  spawnZombie(world, "walker", px + Math.cos(a) * r, py + Math.sin(a) * r);
}
const input: PlayerInput = { ...NEUTRAL_INPUT, fire: true, isMouse: true, aimX: 1, aimY: 0 };
let seq = 0;
function tick(): void {
  const p = world.players.get("p1");
  const z = world.zombies;
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < z.aliveCount; i++) {
    const id = z.aliveIds[i] as number;
    const d = ((z.x[id] as number) - (p?.x ?? 0)) ** 2 + ((z.y[id] as number) - (p?.y ?? 0)) ** 2;
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  if (p && best >= 0 && bd > 0) {
    const d = Math.sqrt(bd);
    input.aimX = ((z.x[best] as number) - p.x) / d;
    input.aimY = ((z.y[best] as number) - p.y) / d;
  }
  input.seq = ++seq;
  setInput(world, "p1", input);
  step(world, 0.05);
  // keep the crowd at 150 (the stress scene's rule)
  for (let i = world.zombies.aliveCount; i < 150; i++) {
    const a = Math.random() * Math.PI * 2;
    spawnZombie(world, "walker", px + Math.cos(a) * 12, py + Math.sin(a) * 8);
  }
}

for (let i = 0; i < 100; i++) tick();
const s = new Session();
s.connect();
await s.post("HeapProfiler.enable");
await s.post("HeapProfiler.startSampling", { samplingInterval: 1024, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
for (let i = 0; i < ticks; i++) tick();
const { profile } = await s.post("HeapProfiler.stopSampling");
const self = new Map<string, number>();
let total = 0;
const walk = (n: { callFrame: { functionName: string; url: string; lineNumber: number }; selfSize: number; children: unknown[] }): void => {
  const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber + 1}`;
  self.set(k, (self.get(k) ?? 0) + n.selfSize);
  total += n.selfSize;
  for (const c of n.children) walk(c as typeof n);
};
walk(profile.head as never);
const per10s = (b: number): number => +((b / 1048576) * (200 / ticks)).toFixed(2);
console.log(JSON.stringify({ stage, ticks, alive: world.zombies.aliveCount, mbPer10s: per10s(total) }));
for (const [k, b] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`${per10s(b).toFixed(2)} MB  ${k}`);
s.disconnect();
