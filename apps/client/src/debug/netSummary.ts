import { PerfSummary, perf, type NetOverlaySource } from "./perfStats";

/**
 * The online wave summary (Story 2.10, Task 4): from `wave.started` to `wave.ended`, FPS (the
 * Story 1.11 `PerfSummary`), bandwidth (the `NetMeter`, marked at the wave start), ping (one
 * sample a second, average and p95) and the hit and snap counters' growth over the wave. When the
 * wave ends with the overlay on, the report is published for the summary box and its Copy results
 * button. Pure apart from the default environment reader: tests pass times and sources in.
 */

/** One ping sample a second; 30 minutes kept (preallocated). */
export const PING_SAMPLE_MS = 1000;
export const PING_SAMPLES_MAX = 1800;

/** The byte counters the summary reads (`NetMeter` fits). */
export interface NetMeterLike {
  markWave(nowMs: number): void;
  avgDownKBps(nowMs: number): number;
  peakDownKBps(nowMs: number): number;
  avgUpKBps(nowMs: number): number;
}

export interface NetWaveResult {
  wave: number;
  scenario: string;
  durationS: number;
  avgFps: number;
  minFps: number;
  worstSecondFps: number;
  avgDownKBps: number;
  peakDownKBps: number;
  avgUpKBps: number;
  avgPingMs: number;
  p95PingMs: number;
  apparentHits: number;
  confirmed: number;
  reversed: number;
  /** Reversed as a percentage of apparent hits (NFR5: below 5). */
  reversedPct: number;
  snaps: number;
  corrections: number;
}

export interface NetSummaryEnv {
  userAgent: string;
  viewport: string;
  dpr: number;
  /** `?lag=&jitter=` when the dev throttle is on, else "none". */
  throttle: string;
  /** `navigator.connection.effectiveType` where the browser has it (Chrome on Android), else "?". */
  connection: string;
}

type Listener = (report: string) => void;

/** 95th percentile of `values[0, n)` (nearest rank). Sorts a copy: called once per wave. */
export function percentile95(values: Float64Array, n: number): number {
  if (n <= 0) return 0;
  const sorted = values.slice(0, n).sort();
  return sorted[Math.min(n - 1, Math.ceil(0.95 * n) - 1)] as number;
}

export class NetWaveSummary {
  /** The report of the last wave ended with the overlay on ("" = none to show). */
  report = "";
  private readonly listeners = new Set<Listener>();
  private running = false;
  private wave = 0;
  private startMs = 0;
  private perfSummary: PerfSummary | null = null;
  private readonly pings = new Float64Array(PING_SAMPLES_MAX);
  private pingCount = 0;
  private nextPingMs = 0;
  private readonly at = { apparentHits: 0, confirmed: 0, reversed: 0, snaps: 0, corrections: 0 };

  constructor(private readonly env: () => NetSummaryEnv = browserEnv) {}

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** `wave.started`: restart every counter (and the byte meter's averages). */
  start(nowMs: number, wave: number, src: NetOverlaySource, meter: NetMeterLike): void {
    this.running = true;
    this.wave = wave;
    this.startMs = nowMs;
    this.perfSummary = new PerfSummary(); // once per wave
    perf.summary = this.perfSummary;
    this.pingCount = 0;
    this.nextPingMs = nowMs;
    const s = src.netStats;
    this.at.apparentHits = s.apparentHits;
    this.at.confirmed = s.confirmed;
    this.at.reversed = s.reversed;
    this.at.snaps = s.snaps;
    this.at.corrections = s.corrections;
    meter.markWave(nowMs);
  }

  /** Every frame while online: one ping sample a second (after the first RTT arrived). */
  frame(nowMs: number, src: NetOverlaySource): void {
    if (!this.running || nowMs < this.nextPingMs) return;
    this.nextPingMs = nowMs + PING_SAMPLE_MS;
    const rtt = src.netStats.rttMs;
    if (rtt > 0 && this.pingCount < PING_SAMPLES_MAX) this.pings[this.pingCount++] = rtt;
  }

  /**
   * `wave.ended`: the wave's numbers, or null when no wave was being measured. With `show` (the
   * overlay is on) the report is published for the summary box.
   */
  end(nowMs: number, wave: number, src: NetOverlaySource, meter: NetMeterLike, show: boolean): NetWaveResult | null {
    if (!this.running || wave !== this.wave) {
      this.cancel();
      return null;
    }
    const fps = this.perfSummary?.result();
    this.cancel();
    const s = src.netStats;
    // A counter that went down was reset (the hit counter starts over when the overlay is switched on).
    const grown = (now: number, then: number): number => (now >= then ? now - then : now);
    let pingSum = 0;
    for (let i = 0; i < this.pingCount; i++) pingSum += this.pings[i] as number;
    const apparentHits = grown(s.apparentHits, this.at.apparentHits);
    const reversed = grown(s.reversed, this.at.reversed);
    const r: NetWaveResult = {
      wave,
      scenario: src.scenario,
      durationS: (nowMs - this.startMs) / 1000,
      avgFps: fps?.avgFps ?? 0,
      minFps: fps?.minFps ?? 0,
      worstSecondFps: fps?.worstSecondFps ?? 0,
      avgDownKBps: meter.avgDownKBps(nowMs),
      peakDownKBps: meter.peakDownKBps(nowMs),
      avgUpKBps: meter.avgUpKBps(nowMs),
      avgPingMs: this.pingCount > 0 ? pingSum / this.pingCount : 0,
      p95PingMs: percentile95(this.pings, this.pingCount),
      apparentHits,
      confirmed: grown(s.confirmed, this.at.confirmed),
      reversed,
      reversedPct: apparentHits > 0 ? (100 * reversed) / apparentHits : 0,
      snaps: grown(s.snaps, this.at.snaps),
      corrections: grown(s.corrections, this.at.corrections),
    };
    if (show) {
      this.report = formatNetReport(r, this.env());
      this.publish();
    }
    return r;
  }

  /** Stops measuring without a report (scene shut down, wave mismatch). */
  cancel(): void {
    if (this.running && perf.summary === this.perfSummary) perf.summary = null;
    this.running = false;
    this.perfSummary = null;
  }

  /** The summary box was closed. */
  dismiss(): void {
    this.report = "";
    this.publish();
  }

  private publish(): void {
    for (const l of this.listeners) l(this.report);
  }
}

function browserEnv(): NetSummaryEnv {
  if (typeof window === "undefined") return { userAgent: "unknown", viewport: "?", dpr: 1, throttle: "none", connection: "?" };
  const q = new URLSearchParams(location.search);
  const lag = q.get("lag");
  const jitter = q.get("jitter");
  const conn = (navigator as { connection?: { effectiveType?: unknown } }).connection?.effectiveType;
  return {
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    throttle: lag || jitter ? `?lag=${lag ?? 0}&jitter=${jitter ?? 0}` : "none",
    connection: typeof conn === "string" ? conn : "?",
  };
}

const f1 = (n: number) => n.toFixed(1);
const i0 = (n: number) => String(Math.round(n));

/** Plain-text report plus a ready-made row for the results table in docs/perf/epic-2-network.md. */
export function formatNetReport(r: NetWaveResult, env: NetSummaryEnv): string {
  const tag = r.scenario ? ` (TEST SCENARIO ${r.scenario})` : "";
  return [
    `Network results: wave ${r.wave}${tag}, ${f1(r.durationS)} s`,
    `FPS avg ${f1(r.avgFps)} · min ${f1(r.minFps)} (worst second ${r.worstSecondFps})`,
    `down avg ${f1(r.avgDownKBps)} KB/s · peak ${f1(r.peakDownKBps)} KB/s · up avg ${f1(r.avgUpKBps)} KB/s`,
    `(KB = 1024 bytes of message payload; no WebSocket/TCP/TLS overhead)`,
    `ping avg ${i0(r.avgPingMs)} ms · p95 ${i0(r.p95PingMs)} ms`,
    `hits ${r.apparentHits} · reversed ${r.reversed} (${f1(r.reversedPct)}%) · confirmed ${r.confirmed}`,
    `snaps ${r.snaps} · corrections ${r.corrections}`,
    `throttle ${env.throttle} · connection ${env.connection}`,
    `viewport ${env.viewport} @ dpr ${env.dpr}`,
    `UA ${env.userAgent}`,
    "",
    "| device | browser | network | avg / peak down KB/s | up KB/s | avg / p95 ping ms | reversed / apparent hits | FPS avg / min | snaps |",
    `| (device) | ${env.userAgent} | (4G / Wi-Fi + ${env.throttle}) | ${f1(r.avgDownKBps)} / ${f1(r.peakDownKBps)} | ${f1(r.avgUpKBps)} | ${i0(r.avgPingMs)} / ${i0(r.p95PingMs)} | ${r.reversed} / ${r.apparentHits} (${f1(r.reversedPct)}%) | ${f1(r.avgFps)} / ${f1(r.minFps)} | ${r.snaps} |`,
  ].join("\n");
}

/** The page's one summary. */
export const netSummary = new NetWaveSummary();
