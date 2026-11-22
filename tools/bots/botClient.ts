import { Client, type Room } from "@colyseus/sdk";
import {
  BYTES,
  ByteRate,
  C2S,
  HORDE_MAX_RECORDS,
  NEUTRAL_INPUT,
  NET_EVENT_KIND,
  RUN_ROOM_NAME,
  S2C,
  TICK_DT_S,
  attachByteCounters,
  botConfigOf,
  botInput,
  createBotView,
  loadBalance,
  readHordeFrame,
  type BotConfig,
  type BotMate,
  type BotView,
  type HordeSink,
  type JoinOptions,
  type NetPinged,
  type PlayerInput,
  type PlayerStateView,
  type RunJoined,
  type RunStateView,
  type SimEventsFlushed,
  type TestScenario,
} from "@topdown/shared";

/**
 * One headless bot player (Story 2.10, AC 4) in a real room, through the same SDK as the phones.
 * It does not render, predict or interpolate: each 50 ms it builds a `BotView` from the newest
 * state (players) and the newest horde frame (zombies), asks the shared `botInput` policy, and
 * sends `input.send` with seq + 1. It taps Ready, answers `net.pinged`, and counts its own payload
 * bytes both ways with the same `ByteRate` the client overlay uses. One log line per wave.
 */

export interface BotClientOptions {
  /** Game server URL, e.g. http://localhost:2567 (or https://hordes.sevend.io/api). */
  url: string;
  /** Sent as the WebSocket and HTTP `Origin` (a production server checks it, Story 2.2). */
  origin?: string;
  name: string;
  /** Join this room code, or create a room when absent. */
  roomId?: string;
  /** With create only: ask for a fixed test scenario. */
  scenario?: TestScenario;
  /**
   * Load-test knob (not policy): no firing for the first this many seconds of each wave, so the
   * horde builds up to the alive cap (150) before the bots thin it. Default 0.
   */
  holdFireS?: number;
  /** One JSON object per line goes here (default: stdout). */
  log?: (line: Record<string, unknown>) => void;
}

/** What one bot measured over one wave (`wave.started` → `wave.ended`). */
export interface BotWaveStats {
  bot: string;
  playerId: string;
  wave: number;
  seconds: number;
  avgDownKBps: number;
  peakDownKBps: number;
  avgUpKBps: number;
  rttMs: number;
  hordeFramesPerS: number;
  avgZombiesInFrame: number;
  kills: number;
  downs: number;
  revives: number;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;
const INPUT_INTERVAL_MS = TICK_DT_S * 1000;

/** The newest horde frame, decoded into preallocated arrays. */
class HordeView implements HordeSink {
  readonly xs = new Float32Array(HORDE_MAX_RECORDS);
  readonly ys = new Float32Array(HORDE_MAX_RECORDS);
  count = 0;
  frames = 0;
  recordsSum = 0;
  begin(_tick: number, count: number): void {
    this.count = count;
  }
  record(i: number, _netId: number, x: number, y: number): void {
    this.xs[i] = x;
    this.ys[i] = y;
  }
  end(): void {
    this.frames++;
    this.recordsSum += this.count;
  }
}

/** A bot re-sends Ready after this many server ticks without the server showing it (1 s). */
const READY_RETRY_TICKS = 20;

export class BotClient {
  readonly down = new ByteRate();
  readonly up = new ByteRate();
  /** Per-wave results, in order. */
  readonly waves: BotWaveStats[] = [];
  playerId = "";
  slot = -1;
  rttMs = 0;
  /** The last wave whose `wave.ended` this bot saw (0 = none yet). */
  lastEndedWave = 0;
  /** Set when the room closed under the bot (server stop, room error, kicked): `code` and reason. */
  closed: { code: number; reason: string } | null = null;
  private readonly cfg: BotConfig;
  private readonly view: BotView = createBotView();
  private readonly input: PlayerInput = { ...NEUTRAL_INPUT };
  private readonly horde = new HordeView();
  private seq = 0;
  private leaving = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private waveNumber = 0;
  private waveStartMs = 0;
  private waveFrames0 = 0;
  private waveRecords0 = 0;
  private waveKills0 = 0;
  private downs = 0;
  private revives = 0;
  private readonly log: (line: Record<string, unknown>) => void;
  private readonly holdFireMs: number;
  private readonly visitMate = (p: PlayerStateView, id: string): void => {
    const v = this.view;
    if (id === this.playerId || v.teammateCount >= v.teammates.length) return;
    const m = v.teammates[v.teammateCount++] as BotMate;
    m.x = p.x;
    m.y = p.y;
    m.status = p.status;
  };

  private constructor(
    readonly room: Room<unknown, RunStateView>,
    readonly name: string,
    log: (line: Record<string, unknown>) => void,
    holdFireS: number,
  ) {
    this.holdFireMs = holdFireS * 1000;
    this.cfg = botConfigOf(balance);
    this.log = log;
    const now = (): number => performance.now();
    attachByteCounters(room as unknown as Parameters<typeof attachByteCounters>[0], this.down, this.up, now);
    room.onMessage(S2C.RUN_JOINED, (m: RunJoined) => {
      this.playerId = m.playerId;
      this.slot = m.slot;
    });
    room.onMessage(S2C.NET_PINGED, (m: NetPinged) => {
      room.send(C2S.NET_PONG, { id: m.id });
      this.rttMs = m.rttMs;
    });
    room.onMessage(BYTES.HORDE_FRAME, (b: Uint8Array) => void readHordeFrame(b, this.horde));
    room.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => this.receiveEvents(m));
    room.onMessage(S2C.PLAYER_LEFT, () => {});
    room.onMessage(S2C.SERVER_SHUTDOWN_STARTED, () => {});
    room.onLeave((code: number, reason?: string) => {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      if (this.leaving) return;
      this.closed = { code, reason: reason ?? "" };
      this.log({ msg: "bot_room_closed", bot: name, code, reason: reason ?? "" });
    });
  }

  /** Joins (or creates) and taps Ready. */
  static async connect(opts: BotClientOptions): Promise<BotClient> {
    const client = new Client(opts.url, opts.origin ? { headers: { Origin: opts.origin } } : undefined);
    const options: JoinOptions = {
      intent: opts.roomId ? "join" : "create",
      name: opts.name,
      balanceVersion: balance.version,
      guestToken: guestToken(),
    };
    if (!opts.roomId && opts.scenario) options.scenario = opts.scenario;
    const room = opts.roomId
      ? await client.joinById<RunStateView>(opts.roomId, options)
      : await client.create<RunStateView>(RUN_ROOM_NAME, options);
    const bot = new BotClient(room, opts.name, opts.log ?? ((l) => console.log(JSON.stringify(l))), opts.holdFireS ?? 0);
    room.send(C2S.LOBBY_SET_READY, { ready: true });
    bot.timer = setInterval(() => bot.step(), INPUT_INTERVAL_MS);
    return bot;
  }

  get roomId(): string {
    return this.room.roomId;
  }

  /** This bot is the room's host (slot = `hostSlot`). */
  get isHost(): boolean {
    return this.slot >= 0 && this.room.state?.hostSlot === this.slot;
  }

  /** Stops sending and leaves the room. */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.leaving = true;
    await this.room.leave(true).catch(() => {});
  }

  /** Server tick of the last build-phase Ready sent (Story 3.1). */
  private readyAtTick = -1;

  /** One input: the policy on the newest data, every 50 ms while the room fights. */
  private step(): void {
    const state = this.room.state;
    // Story 3.1: the fight runs in build and wave phases; a bot taps Ready in every build phase.
    if (!state?.players || (state.phase !== "wave" && state.phase !== "build") || !this.playerId) return;
    const me = state.players.get(this.playerId);
    if (!me) return;
    // Once per build, retried after ~1 s if the server still hasn't got it (3.1 review: it shares
    // the 10/s "other" bucket with pongs).
    if (state.phase === "build" && !me.buildReady && (this.readyAtTick < 0 || state.tick - this.readyAtTick >= READY_RETRY_TICKS)) {
      this.readyAtTick = state.tick;
      this.room.send(C2S.BUILD_SET_READY, { ready: true });
    }
    if (state.phase !== "build") this.readyAtTick = -1;
    const v = this.view;
    v.self.x = me.x;
    v.self.y = me.y;
    v.self.status = me.status;
    const weapon = me.active === 1 ? me.weapon1 : me.weapon0;
    v.self.rangeM = balance.weapons[weapon]?.rangeM ?? 0;
    v.teammateCount = 0;
    state.players.forEach(this.visitMate);
    const h = this.horde;
    let best = Infinity;
    let bi = -1;
    for (let i = 0; i < h.count; i++) {
      const dx = (h.xs[i] as number) - me.x;
      const dy = (h.ys[i] as number) - me.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        bi = i;
      }
    }
    if (bi >= 0) {
      v.zombie.x = h.xs[bi] as number;
      v.zombie.y = h.ys[bi] as number;
      v.zombie.distM = Math.sqrt(best);
      v.nearestZombie = v.zombie;
    } else {
      v.nearestZombie = null;
    }
    botInput(v, this.cfg, ++this.seq, this.input);
    if (this.waveNumber > 0 && performance.now() - this.waveStartMs < this.holdFireMs) this.input.fire = false;
    this.room.send(C2S.INPUT_SEND, this.input);
  }

  private receiveEvents(m: SimEventsFlushed): void {
    if (!m || !Array.isArray(m.events)) return;
    for (const t of m.events) {
      const kind = t[0];
      if (kind === NET_EVENT_KIND.WAVE_STARTED) this.waveStarted(t[1] as number);
      else if (kind === NET_EVENT_KIND.WAVE_ENDED) this.waveEnded(t[1] as number);
      else if (kind === NET_EVENT_KIND.PLAYER_DOWNED && t[1] === this.slot) this.downs++;
      else if (kind === NET_EVENT_KIND.PLAYER_REVIVED && t[2] === this.slot) this.revives++;
    }
  }

  private kills(): number {
    return this.room.state?.players?.get(this.playerId)?.kills ?? 0;
  }

  private waveStarted(n: number): void {
    const now = performance.now();
    this.waveNumber = n;
    this.waveStartMs = now;
    this.down.mark(now);
    this.up.mark(now);
    this.waveFrames0 = this.horde.frames;
    this.waveRecords0 = this.horde.recordsSum;
    this.waveKills0 = this.kills();
    this.downs = 0;
    this.revives = 0;
  }

  private waveEnded(n: number): void {
    const now = performance.now();
    if (n !== this.waveNumber) {
      this.lastEndedWave = n; // joined mid-wave: nothing measured
      return;
    }
    const seconds = (now - this.waveStartMs) / 1000;
    const frames = this.horde.frames - this.waveFrames0;
    const stats: BotWaveStats = {
      bot: this.name,
      playerId: this.playerId,
      wave: n,
      seconds: r1(seconds),
      avgDownKBps: r1(this.down.avgKBps(now)),
      peakDownKBps: r1(this.down.peakKBps(now)),
      avgUpKBps: r1(this.up.avgKBps(now)),
      rttMs: Math.round(this.rttMs),
      hordeFramesPerS: seconds > 0 ? r1(frames / seconds) : 0,
      avgZombiesInFrame: frames > 0 ? r1((this.horde.recordsSum - this.waveRecords0) / frames) : 0,
      kills: this.kills() - this.waveKills0,
      downs: this.downs,
      revives: this.revives,
    };
    this.waves.push(stats);
    this.lastEndedWave = n;
    this.log({ msg: "bot_wave", ...stats });
  }
}

const balance = loadBalance();

/** A random guest token (16 bytes, hex), like a fresh browser's. */
function guestToken(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
