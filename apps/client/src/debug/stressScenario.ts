import { BUILD_GRID_M, addBuildingAt, buildingStats, footprint, footprintBlocked, spawnZombie, type Box, type DistrictMap, type PlayerInput, type World, type ZombieTypeId } from "@topdown/shared";
import { PerfSummary, TARGET_AVG_FPS, TARGET_MIN_FPS, perf, type PerfSummaryResult } from "./perfStats";

/**
 * The fixed `?stress=N` scenario (Story 1.11, NFR1). It runs in release builds too, because the
 * reference phones test the published link: god mode on, waves paused, N Walkers inside the view.
 * This is a deliberate exception to "no cheats in release": no free-form cheat is reachable, only
 * this one scenario. Pure helpers (no Phaser), so they run in unit tests.
 */

/** Measured run length after the warm-up. */
export const STRESS_DURATION_MS = 60_000;
/** Frames ignored at the start (scene creation, texture uploads, first crowd push). */
export const STRESS_WARMUP_MS = 2_000;
/** Spawned zombies keep at least this far from the survivor (they still close in at once). */
export const SPAWN_CLEAR_M = 2.5;
const SPAWN_TRIES = 8;

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The view of size w × h centered on (cx, cy), clamped inside the map like the camera bounds. */
export function viewAround(map: DistrictMap, cx: number, cy: number, w: number, h: number, out: ViewRect): ViewRect {
  out.w = w;
  out.h = h;
  out.x = map.widthM > w ? Math.min(map.widthM - w, Math.max(0, cx - w / 2)) : (map.widthM - w) / 2;
  out.y = map.heightM > h ? Math.min(map.heightM - h, Math.max(0, cy - h / 2)) : (map.heightM - h) / 2;
  return out;
}

/**
 * Spawns `count` zombies at seeded random points inside `view` (the World's `spawns` stream, so a run is repeatable),
 * kept `clearM` away from (avoidX, avoidY) and inside the map. Returns how many spawned.
 */
export function spawnInView(
  world: World,
  type: ZombieTypeId,
  count: number,
  view: ViewRect,
  avoidX: number,
  avoidY: number,
  clearM = SPAWN_CLEAR_M,
): number {
  const r = world.balance.zombies.types[type]?.radiusM ?? 0.35;
  const x0 = Math.max(r, view.x + r);
  const x1 = Math.min(world.map.widthM - r, view.x + view.w - r);
  const y0 = Math.max(r, view.y + r);
  const y1 = Math.min(world.map.heightM - r, view.y + view.h - r);
  let spawned = 0;
  for (let i = 0; i < count; i++) {
    let x = x0;
    let y = y0;
    for (let t = 0; t < SPAWN_TRIES; t++) {
      x = world.streams.spawns.range(x0, x1);
      y = world.streams.spawns.range(y0, y1);
      const dx = x - avoidX;
      const dy = y - avoidY;
      if (dx * dx + dy * dy >= clearM * clearM) break;
    }
    if (spawnZombie(world, type, x, y) < 0) break; // pool full
    spawned++;
  }
  return spawned;
}

/** Sets the World up for the stress scenario: god mode, no waves, `walkers` Walkers in view. */
export function setupStressWorld(world: World, walkers: number, view: ViewRect, playerX: number, playerY: number): number {
  world.debug.godMode = true;
  world.waves.paused = true;
  return spawnInView(world, "walker", walkers, view, playerX, playerY);
}

/** Story 5.9: floor buildings `?stressbuild=traps` lays (every player's whole allowance: 4 × 6). */
export const STRESS_FLOOR_BUILDINGS = 24;
/** Rings (m) round the survivor where they are tried, 16 directions each. */
const STRESS_FLOOR_RINGS_M: readonly number[] = [3, 5, 7, 9, 11];

/**
 * Story 5.9 (`?stressbuild=traps`): lays up to `count` floor buildings round (cx, cy), spike traps and
 * mines alternately, on free lattice spots (the shared `footprintBlocked`, without the cap or money:
 * a benchmark, not a placement). Call before the Walkers spawn. Returns how many were laid.
 */
export function placeStressFloor(world: World, ownerId: string, cx: number, cy: number, count = STRESS_FLOOR_BUILDINGS): number {
  const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let laid = 0;
  for (const r of STRESS_FLOOR_RINGS_M) {
    for (let k = 0; k < 16 && laid < count; k++) {
      const type = laid % 2 === 0 ? "spike_trap" : "mine";
      const stats = buildingStats(world.balance, type);
      if (!stats) return laid;
      const a = (k / 16) * Math.PI * 2;
      const gx = Math.round((cx + Math.cos(a) * r - stats.widthM / 2) / BUILD_GRID_M);
      const gy = Math.round((cy + Math.sin(a) * r - stats.depthM / 2) / BUILD_GRID_M);
      if (footprintBlocked(world, footprint(stats, gx, gy, 0, box))) continue;
      if (addBuildingAt(world, { id: world.buildings.nextId, type, ownerId, gx, gy, rot: 0, hp: stats.hp })) laid++;
    }
  }
  return laid;
}

/** Story 5.9: under `?stressbuild=traps` the Walkers can't die on the spikes (the crowd stays 150 for the whole run). */
export function toughenStressZombies(world: World): void {
  const z = world.zombies;
  for (let i = 0; i < z.aliveCount; i++) z.hp[z.aliveIds[i] as number] = 1e9;
}

/**
 * Story 5.3 `?stressfire=1`: aims `input` (mouse aim: no assist) at the zombie nearest to player
 * `playerId` and holds fire; no zombie → fire released. Allocation-free (runs every frame).
 * Returns whether it aimed at one.
 */
export function stressFireInput(world: World, playerId: string, input: PlayerInput): boolean {
  const p = world.players.get(playerId);
  const z = world.zombies;
  let best = -1;
  let bestD2 = Infinity;
  if (p) {
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      const dx = (z.x[id] as number) - p.x;
      const dy = (z.y[id] as number) - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = id;
      }
    }
  }
  if (!p || best < 0 || bestD2 === 0) {
    input.fire = false;
    return false;
  }
  const d = Math.sqrt(bestD2);
  input.aimX = ((z.x[best] as number) - p.x) / d;
  input.aimY = ((z.y[best] as number) - p.y) / d;
  input.fire = true;
  input.isMouse = true;
  return true;
}

export type StressPhase = "idle" | "warmup" | "running" | "done" | "interrupted";

export interface StressState {
  phase: StressPhase;
  walkers: number;
  /** Measured seconds left while running. */
  secondsLeft: number;
  result: PerfSummaryResult | null;
  /** Copy-ready report once done. */
  report: string;
}

type Listener = (s: StressState) => void;

/** Drives one stress run: warm-up, 60 s of measurement into `perf.summary`, then the report. */
export class StressRun {
  readonly state: StressState = { phase: "idle", walkers: 0, secondsLeft: 0, result: null, report: "" };
  private readonly listeners = new Set<Listener>();
  private warmupUntilMs = 0;
  private summary: PerfSummary | null = null;

  constructor(private readonly env: () => StressEnv = browserEnv) {}

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private publish(): void {
    for (const l of this.listeners) l(this.state);
  }

  start(nowMs: number, walkers: number): void {
    this.state.phase = "warmup";
    this.state.walkers = walkers;
    this.state.result = null;
    this.state.report = "";
    this.state.secondsLeft = STRESS_DURATION_MS / 1000;
    this.warmupUntilMs = nowMs + STRESS_WARMUP_MS;
    this.summary = null;
    perf.summary = null;
    perf.overlayOn = true;
    this.publish();
  }

  /** Called once per rendered frame (after the frame was recorded). */
  frame(nowMs: number): void {
    const s = this.state;
    if (s.phase === "warmup" && nowMs >= this.warmupUntilMs) {
      s.phase = "running";
      this.summary = new PerfSummary();
      perf.summary = this.summary;
      this.publish();
    } else if (s.phase === "running" && this.summary) {
      const elapsed = this.summary.elapsedMs();
      s.secondsLeft = Math.max(0, Math.ceil((STRESS_DURATION_MS - elapsed) / 1000));
      if (elapsed >= STRESS_DURATION_MS) {
        perf.summary = null;
        s.result = this.summary.result();
        s.report = formatStressReport(s.result, s.walkers, this.env());
        s.phase = "done";
        this.summary = null;
        this.publish();
      }
    }
  }

  /**
   * The page went to the background (screen dimmed, notification, app switch): the run's numbers
   * would be wrong, so it stops with a message instead of a report.
   */
  interrupt(): void {
    if (this.state.phase === "warmup" || this.state.phase === "running") {
      this.state.phase = "interrupted";
      this.state.result = null;
      this.state.report = INTERRUPTED_REPORT;
      perf.summary = null;
      this.summary = null;
      this.publish();
    }
  }

  /** Stops a run without a report (scene shut down). */
  cancel(): void {
    if (this.state.phase === "warmup" || this.state.phase === "running") {
      this.state.phase = "idle";
      perf.summary = null;
      this.summary = null;
      this.publish();
    }
  }
}

export const INTERRUPTED_REPORT =
  "Run interrupted: the game went to the background (screen dimmed, a notification or an app switch). Keep the screen on and reload the page to measure again.";

export interface StressEnv {
  userAgent: string;
  /** CSS viewport size and the render DPR. */
  viewport: string;
  dpr: number;
}

function browserEnv(): StressEnv {
  if (typeof window === "undefined") return { userAgent: "unknown", viewport: "?", dpr: 1 };
  return {
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
  };
}

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

/** Plain-text report plus a ready-made row for the results table in docs/perf/epic-1-stress.md. */
export function formatStressReport(r: PerfSummaryResult, walkers: number, env: StressEnv): string {
  const verdict = r.targetMet ? "met" : "missed";
  return [
    `Stress test: ${walkers} Walkers, ${f1(r.durationS)} s, ${r.frames} frames`,
    `avg FPS ${f1(r.avgFps)} · min FPS ${f1(r.minFps)} (worst second ${r.worstSecondFps})`,
    `frames < 30 FPS: ${f2(r.pctUnder30)} %`,
    `tick avg ${f2(r.tickAvgMs)} ms · max ${f2(r.tickMaxMs)} ms`,
    `render avg ${f2(r.renderAvgMs)} ms · update avg ${f2(r.updateAvgMs)} ms · frame avg ${f2(r.frameAvgMs)} ms`,
    `target (avg ${TARGET_AVG_FPS}, never < ${TARGET_MIN_FPS}): ${verdict} · bottleneck: ${r.bottleneck}`,
    `viewport ${env.viewport} @ dpr ${env.dpr}`,
    `UA ${env.userAgent}`,
    "",
    "| device | browser | avg FPS | min FPS | % < 30 | tick avg / max ms | render ms | bottleneck |",
    `| (device) | ${env.userAgent} | ${f1(r.avgFps)} | ${f1(r.minFps)} | ${f2(r.pctUnder30)} | ${f2(r.tickAvgMs)} / ${f2(r.tickMaxMs)} | ${f2(r.renderAvgMs)} | ${r.bottleneck} |`,
  ].join("\n");
}

/** The one stress run of the page. */
export const stressRun = new StressRun();
