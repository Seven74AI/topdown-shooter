import { Client, type Room } from "@colyseus/sdk";
import type { Box } from "@topdown/shared";
import { bulletBoxes, fillWireShot, type WireBuilding } from "./wireCover";
import {
  DOWNTOWN_MAP,
  MUZZLE_OFFSET_M,
  BYTES,
  ByteRate,
  C2S,
  HORDE_MAX_RECORDS,
  NEUTRAL_INPUT,
  NET_EVENT_KIND,
  CLOSE_TAKEN_OVER,
  RECONNECT,
  SeatRecovery,
  Watchdog,
  configureReconnection,
  RUN_ROOM_NAME,
  S2C,
  TICK_DT_S,
  attachByteCounters,
  botConfigOf,
  botInput,
  botPlaceCandidate,
  botPlaceTries,
  botShopNext,
  botGearPrice,
  botWeaponSlot,
  createBotView,
  botCardIndex,
  cardItem,
  cardPrice,
  gearBit,
  upgradeEntryWeapon,
  upgradePrice,
  loadBalance,
  HordeStreamDecoder,
  NET_PROTOCOL_VERSION,
  type BotConfig,
  type BotMate,
  type BotShopSelf,
  type BotView,
  type BuildingRefused,
  type HordeSink,
  type JoinOptions,
  type NetPinged,
  type PlayerInput,
  type PlayerStateView,
  type RunJoined,
  type RunStateView,
  type ShopBought,
  type ShopOffered,
  type ShopBoughtItem,
  type ShopRefusedItem,
  type ShopRefused,
  type ShopUpgraded,
  type ShopUpgradeRefused,
  type SimEventsFlushed,
  type TestScenario,
} from "@topdown/shared";

/**
 * One headless bot player (Story 2.10, AC 4) in a real room, through the same SDK as the phones.
 * It does not render, predict or interpolate: each 50 ms it builds a `BotView` from the newest
 * state (players) and the newest horde frame (zombies), asks the shared `botInput` policy, and
 * sends `input.send` with seq + 1. It taps Ready, answers `net.pinged`, and counts its own payload
 * bytes both ways with the same `ByteRate` the client overlay uses. One log line per wave.
 *
 * Story 3.10: in every build phase it first shops from `bots.json › shoppingList` with the shared
 * rules (`bots/botShop.ts`) over the wire: one `shop.buy` or `building.place` at a time, waiting for
 * the answer (`shop.bought` / `shop.refused`, the building in the state / `building.refused`); a
 * refused placement tries the next candidate spot. Then it taps Ready, and swaps to a weapon it
 * bought into the slot not in hands on the first wave step.
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

/** Story 8.1: the bot's link (the phone's rules: shared `Watchdog` + `SeatRecovery`, `net/reconnect.ts`). */
export type BotLinkStatus = "ok" | "reconnecting" | "seat_kept";

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
  /** Story 8.10: horde stream bytes (payload + 2-byte Colyseus header) per s, keyframes per s, refused frames (wave). */
  hordeKBps: number;
  keyframesPerS: number;
  hordeDecodeErrors: number;
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
/** A shop or placement message with no answer after this many server ticks counts as refused (2 s). */
const SHOP_ANSWER_TICKS = 40;

/** One shop action waiting for the server's answer. */
/** Story 5.1: the level of `weapon` in my slots per the state (0 = not held). */
const levelOf = (me: PlayerStateView, weapon: string): number => (me.weapon0 === weapon ? me.level0 : me.weapon1 === weapon ? me.level1 : 0);

interface PendingShop {
  /**
   * Story 5.1: "upgrade" = a weapon upgrade (`owned` holds the level it waits for). Story 5.11: "gear"
   * (`owned` = its bit). Story 5.12: "item" (a consumable). Story 5.13: weapons and gear are cards
   * (`shop.buy` with my offer's build/rev/card): "weapon" / "gear" wait for `shop.bought`.
   */
  kind: "weapon" | "building" | "upgrade" | "gear";
  /** Index in the shopping list. */
  index: number;
  id: string;
  /** Buildings of that type owned when the placement was sent. */
  owned: number;
  sentAtTick: number;
  /** Weapon: `shop.bought` arrived; the entry ends once the state shows the weapon. */
  bought: boolean;
}

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
  /** Investigation cut-test-stall-2026-11-25: the bullet-stopping buildings from the state (`wireCover.ts`). */
  private readonly wireBuildings: WireBuilding[] = [];
  private readonly coverBoxes: Box[] = [];
  private readonly pushWireBuilding = (b: WireBuilding): void => void this.wireBuildings.push(b);
  private readonly input: PlayerInput = { ...NEUTRAL_INPUT };
  private readonly horde = new HordeView();
  private seq = 0;
  private leaving = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private waveNumber = 0;
  private waveStartMs = 0;
  private waveFrames0 = 0;
  private waveRecords0 = 0;
  /** Story 8.10 (brief 20): the same stream decoder as the phone's RunInbox. */
  private readonly hordeStream = new HordeStreamDecoder();
  private hordeBytes = 0;
  private waveHordeBytes0 = 0;
  private waveKeyframes0 = 0;
  private waveHordeErrors0 = 0;
  private waveKills0 = 0;
  private downs = 0;
  private revives = 0;
  private readonly log: (line: Record<string, unknown>) => void;
  private readonly holdFireMs: number;
  /** Story 3.10: weapons bought ("smg@W3") and buildings placed this run. */
  readonly purchases: string[] = [];
  buildingsPlaced = 0;
  spent = 0;
  private shopDone = false;
  private shopSkip = 0;
  private shopPending: PendingShop | null = null;
  /** Story 5.13: my latest `shop.offered` (the highest build, rev). */
  private offer: ShopOffered | null = null;
  private placeAttempt = 0;
  /** The slot the bot will hold once it swapped to what it bought this build (Story 3.10). */
  private hands = -1;
  private swapPending = false;
  private readonly shopSelf: BotShopSelf = { wallet: 0, weapon0: "", weapon1: "", active: 0 };
  private readonly spot = { gx: 0, gy: 0, rot: 0 };
  private readonly list: readonly string[];
  private readonly visitMate = (p: PlayerStateView, id: string): void => {
    const v = this.view;
    if (id === this.playerId || v.teammateCount >= v.teammates.length) return;
    const m = v.teammates[v.teammateCount++] as BotMate;
    m.x = p.x;
    m.y = p.y;
    m.status = p.status;
  };

  /** Story 8.2: this bot joined mid-wave and waited (`PlayerState.waiting`), then entered at a build phase. */
  waited = false;
  entered = false;

  /** Story 8.1: the room I play in (a takeover replaces it). */
  room: Room<unknown, RunStateView>;
  /** Story 8.1: the link status; inputs are sent only while "ok" (F7). */
  link: BotLinkStatus = "ok";
  /** Story 8.1 (AC 11 liveness): drops seen and how each came back. */
  readonly reconnects: { afterMs: number; via: "token" | "guest" }[] = [];
  private droppedAtMs = 0;
  private readonly watchdog = new Watchdog();
  private readonly recovery: SeatRecovery<Room<unknown, RunStateView>>;
  private linkTimer: ReturnType<typeof setInterval> | null = null;

  private constructor(
    room: Room<unknown, RunStateView>,
    readonly name: string,
    log: (line: Record<string, unknown>) => void,
    holdFireS: number,
    /** Story 8.1: a fresh join of the same room with my guest token (the takeover, AC 6). */
    private readonly rejoin: () => Promise<Room<unknown, RunStateView>>,
  ) {
    this.room = room;
    this.holdFireMs = holdFireS * 1000;
    this.cfg = botConfigOf(balance);
    this.list = balance.bots.shoppingList;
    this.log = log;
    this.recovery = new SeatRecovery<Room<unknown, RunStateView>>(
      {
        join: () =>
          this.rejoin().then(
            (r) => ({ ok: true as const, room: r }),
            (e: unknown) => {
              const m = String((e as { message?: unknown })?.message ?? "");
              const code = (e as { code?: unknown })?.code;
              return { ok: false as const, reason: m === "seat_kept" ? ("seat_kept" as const) : typeof code === "number" && (m === "run_started" || /not found/i.test(m)) ? ("gone" as const) : ("network" as const) };
            },
          ),
        onRecovered: (r) => this.recovered(r),
        onSeatKept: () => (this.link = "seat_kept"),
        onGone: () => {
          this.closed = { code: 0, reason: "seat gone" };
          this.log({ msg: "bot_seat_gone", bot: name });
        },
        now: () => performance.now(),
        schedule: (fn, ms) => {
          const t = setTimeout(fn, ms);
          return () => clearTimeout(t);
        },
      },
      // A takeover that landed after the token reconnect won: it holds the seat now (D5: newest wins): adopt it.
      (late) => (this.leaving ? void late.leave(true).catch(() => {}) : this.recovered(late, true)),
    );
    this.wire(room);
    this.linkTimer = setInterval(() => this.checkLink(), 250);
  }

  /** Story 8.1: every handler on a room (the first one, and a room taken over after a cut). */
  private wire(room: Room<unknown, RunStateView>): void {
    const now = (): number => performance.now();
    configureReconnection(room.reconnection); // F7: no offline queue
    attachByteCounters(room as unknown as Parameters<typeof attachByteCounters>[0], this.down, this.up, now);
    const heard = (): void => {
      if (this.room === room && this.link === "ok") this.watchdog.heard(now());
    };
    room.onStateChange(heard);
    room.onMessage(BYTES.HORDE_FRAME, heard);
    room.onDrop(() => {
      if (this.room === room) this.dropped();
    });
    room.onReconnect(() => {
      if (this.room !== room) return;
      this.recovery.cancel();
      this.back("token");
    });
    room.onMessage(S2C.RUN_JOINED, (m: RunJoined) => {
      this.playerId = m.playerId;
      this.slot = m.slot;
    });
    room.onMessage(S2C.NET_PINGED, (m: NetPinged) => {
      room.send(C2S.NET_PONG, { id: m.id });
      this.rttMs = m.rttMs;
    });
    room.onMessage(BYTES.HORDE_FRAME, (b: Uint8Array) => {
      this.hordeBytes += b.length + 2; // + [protocol][type], like the server's horde_stats
      this.hordeStream.decode(b, this.horde);
    });
    room.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => this.receiveEvents(m));
    room.onMessage(S2C.PLAYER_LEFT, () => {});
    room.onMessage(S2C.SHOP_BOUGHT, (m: ShopBought) => this.shopBought(m));
    room.onMessage(S2C.SHOP_OFFERED, (m: ShopOffered) => {
      const o = this.offer;
      if (!o || m.build > o.build || (m.build === o.build && m.rev >= o.rev)) this.offer = m; // Story 5.13
    });
    room.onMessage(S2C.SHOP_REFUSED, (m: ShopRefused) => this.shopRefused(m));
    room.onMessage(S2C.SHOP_UPGRADED, (m: ShopUpgraded) => this.shopUpgraded(m)); // Story 5.1
    room.onMessage(S2C.SHOP_UPGRADE_REFUSED, (m: ShopUpgradeRefused) => this.shopUpgradeRefused(m));
    room.onMessage(S2C.SHOP_BOUGHT_ITEM, (m: ShopBoughtItem) => this.shopBoughtItem(m)); // Story 5.11
    room.onMessage(S2C.SHOP_REFUSED_ITEM, (m: ShopRefusedItem) => this.shopRefusedItem(m));
    room.onMessage(S2C.BUILDING_REFUSED, (m: BuildingRefused) => this.placeRefused(m));
    room.onMessage(S2C.BUILDING_REPAIR_REFUSED, () => {});
    room.onMessage(S2C.SERVER_SHUTDOWN_STARTED, () => {});
    room.onLeave((code: number, reason?: string) => {
      if (this.room !== room || this.leaving) return;
      if (code === CLOSE_TAKEN_OVER && this.recovery.inFlight) return; // our own takeover: its room is adopted next
      if (code === CLOSE_TAKEN_OVER && performance.now() - this.lateAdoptedAtMs < RECONNECT.ownTakeoverMs) {
        // two of my own takeovers crossed (the server kept the other one): take the seat again
        if (this.link === "ok") this.dropped();
        this.recovery.start();
        return;
      }
      // Story 8.1: mid-run, an end that is not a Leave, a shutdown or a takeover is a drop the SDK couldn't repair.
      const phase = room.state?.phase;
      if ((phase === "build" || phase === "wave" || phase === "vote") && code !== 4000 && code !== 4001 && code !== CLOSE_TAKEN_OVER) {
        if (this.link === "ok") this.dropped();
        this.recovery.start();
        return;
      }
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.closed = { code, reason: reason ?? "" };
      this.log({ msg: "bot_room_closed", bot: this.name, code, reason: reason ?? "" });
    });
  }

  /** Story 8.1 (AC 5): 3 s with no message in a run = a dead line: close the socket (non-consented) and reconnect. */
  private checkLink(): void {
    const now = performance.now();
    const phase = this.room.state?.phase;
    if (this.link === "ok") {
      if (phase !== "build" && phase !== "wave" && phase !== "vote") return this.watchdog.disarm();
      if (this.watchdog.fired(now)) {
        this.dropped();
        try {
          (this.room as unknown as { connection?: { close(code?: number, reason?: string): void } }).connection?.close(4010, "no data");
        } catch {
          // the takeover path takes over
        }
      }
      return;
    }
    if (!this.recovery.active && now - this.droppedAtMs >= RECONNECT.takeoverAfterMs) this.recovery.start();
  }

  private dropped(): void {
    if (this.link !== "ok") return;
    this.link = "reconnecting";
    this.droppedAtMs = performance.now();
    this.watchdog.disarm();
    this.log({ msg: "bot_dropped", bot: this.name, playerId: this.playerId });
  }

  private back(via: "token" | "guest"): void {
    const afterMs = Math.round(performance.now() - this.droppedAtMs);
    this.link = "ok";
    this.watchdog.heard(performance.now());
    this.reconnects.push({ afterMs, via });
    this.log({ msg: "bot_reconnected", bot: this.name, playerId: this.playerId, afterMs, via, text: `reconnected after ${afterMs} ms` });
  }

  /** Story 8.1: my seat came back on a new room (a takeover by guest token): play on in it. */
  /** Review L3: when a LATE takeover was adopted (only then is a 4021 soon after my own crossed takeovers). */
  private lateAdoptedAtMs = Number.NEGATIVE_INFINITY;

  private recovered(room: Room<unknown, RunStateView>, late = false): void {
    if (late) this.lateAdoptedAtMs = performance.now();
    const old = this.room;
    old.reconnection.enabled = false;
    this.room = room;
    this.wire(room);
    void old.leave(false).catch(() => {}); // never consented (the seat is the new room's)
    room.send(C2S.LOBBY_SET_READY, { ready: true });
    this.back("guest");
  }

  /** Joins (or creates) and taps Ready. */
  static async connect(opts: BotClientOptions): Promise<BotClient> {
    const client = new Client(opts.url, opts.origin ? { headers: { Origin: opts.origin } } : undefined);
    const options: JoinOptions = {
      intent: opts.roomId ? "join" : "create",
      name: opts.name,
      balanceVersion: balance.version,
      mapVersion: DOWNTOWN_MAP.version,
      netProtocolVersion: NET_PROTOCOL_VERSION, // Story 8.10
      guestToken: guestToken(),
    };
    if (!opts.roomId && opts.scenario) options.scenario = opts.scenario;
    const room = opts.roomId
      ? await client.joinById<RunStateView>(opts.roomId, options)
      : await client.create<RunStateView>(RUN_ROOM_NAME, options);
    // Story 8.1: the takeover joins the same room again with the same guest token (the seat's identity).
    const rejoin = (): Promise<Room<unknown, RunStateView>> => client.joinById<RunStateView>(room.roomId, { ...options, intent: "join" });
    const bot = new BotClient(room, opts.name, opts.log ?? ((l) => console.log(JSON.stringify(l))), opts.holdFireS ?? 0, rejoin);
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
    if (this.linkTimer) clearInterval(this.linkTimer);
    this.linkTimer = null;
    this.recovery.cancel();
    this.leaving = true;
    await this.room.leave(true).catch(() => {});
  }

  /** Server tick of the last build-phase Ready sent (Story 3.1). */
  private readyAtTick = -1;
  /** Story 6.11: server tick of the last evacuation vote sent. */
  private voteAtTick = -1;

  /** One input: the policy on the newest data, every 50 ms while the room fights. */
  private step(): void {
    const state = this.room.state;
    // Story 6.11: in the evacuation vote every bot votes Extract (once; retried like Ready if it didn't arrive).
    if (state?.players && state.phase === "vote" && this.playerId) {
      const me = state.players.get(this.playerId);
      if (me && me.vote !== 1 && (this.voteAtTick < 0 || state.tick - this.voteAtTick >= READY_RETRY_TICKS)) {
        this.voteAtTick = state.tick;
        this.room.send(C2S.EVAC_VOTE, { choice: "extract" });
      }
      return;
    }
    // Story 3.1: the fight runs in build and wave phases; a bot taps Ready in every build phase.
    if (!state?.players || (state.phase !== "wave" && state.phase !== "build") || !this.playerId) return;
    const me = state.players.get(this.playerId);
    if (!me) return;
    // Story 8.2 (J4): a late joiner waiting for the next build phase watches: no input, no shop, no Ready.
    if (me.waiting === true) {
      if (!this.waited) this.log({ msg: "bot_waiting", bot: this.name, playerId: this.playerId, phase: state.phase, wave: state.wave });
      this.waited = true;
      return;
    }
    if (this.waited && !this.entered) {
      this.entered = true;
      this.log({ msg: "bot_entered", bot: this.name, playerId: this.playerId, wave: state.wave, wallet: me.wallet });
    }
    // Story 3.10: shop first (one action per step, waiting for each answer), then Ready.
    if (state.phase === "build" && !this.shopDone) this.shopStep(state, me);
    // Once per build, retried after ~1 s if the server still hasn't got it (3.1 review: it shares
    // the 10/s "other" bucket with pongs).
    if (state.phase === "build" && this.shopDone && !me.buildReady && (this.readyAtTick < 0 || state.tick - this.readyAtTick >= READY_RETRY_TICKS)) {
      this.readyAtTick = state.tick;
      this.room.send(C2S.BUILD_SET_READY, { ready: true });
    }
    if (state.phase !== "build") {
      this.readyAtTick = -1;
      if (this.shopDone || this.shopPending) this.endShopping();
    }
    const v = this.view;
    v.self.x = me.x;
    v.self.y = me.y;
    v.self.status = me.status;
    const weapon = me.active === 1 ? me.weapon1 : me.weapon0;
    const ws = balance.weapons[weapon];
    v.self.rangeM = ws?.rangeM ?? 0;
    // Story 5.5: a launcher lobs to the target's distance (the aim length; FR-A).
    v.self.lobRangeM = ws?.kind === "launcher" ? ws.lobRangeM : 0;
    v.self.minLobM = ws?.kind === "launcher" ? ws.minLobM : 0;
    v.self.muzzleM = balance.player.radiusM + MUZZLE_OFFSET_M;
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
    // A Spitter behind a barricade spits over it but stops my bullets: aim at a clear one, or strafe (rule 2c).
    this.wireBuildings.length = 0;
    state.buildings?.forEach(this.pushWireBuilding);
    fillWireShot(v, h.xs, h.ys, h.count, this.coverBoxes, bulletBoxes(balance, this.wireBuildings, this.coverBoxes));
    botInput(v, this.cfg, ++this.seq, this.input);
    if (this.swapPending && state.phase === "wave") {
      this.input.swap = true; // to the weapon bought into the slot not in hands
      this.swapPending = false;
    }
    if (this.waveNumber > 0 && performance.now() - this.waveStartMs < this.holdFireMs) this.input.fire = false;
    if (this.link !== "ok") return; // Story 8.1 (F7): nothing sent while the link is down (and nothing late)
    this.room.send(C2S.INPUT_SEND, this.input);
  }

  /** Buildings of `type` this bot owns (from the state). */
  private owned(state: RunStateView, type: string): number {
    let n = 0;
    state.buildings?.forEach((b) => {
      if (b.owner === this.playerId && b.type === type) n++;
    });
    return n;
  }

  /** One shopping action in a build phase (Story 3.10), or waiting for the last one's answer. */
  private shopStep(state: RunStateView, me: PlayerStateView): void {
    if (this.hands < 0) this.hands = me.active;
    const pending = this.shopPending;
    if (pending) {
      // A bought weapon: wait until the state shows it in a slot (3.10 review: deciding the next
      // purchase from the pre-purchase patch re-sent the same buy, refused as already_owned).
      if (pending.kind === "weapon" && pending.bought && (me.weapon0 === pending.id || me.weapon1 === pending.id)) {
        this.shopPending = null;
      } else if (pending.kind === "upgrade" && pending.bought && levelOf(me, pending.id) >= pending.owned) {
        this.shopPending = null; // Story 5.1: the state shows the new level
      } else if (pending.kind === "gear" && pending.bought && (me.gear & pending.owned) !== 0) {
        this.shopPending = null; // Story 5.11: the state shows the gear bit
      } else if (pending.kind === "building" && this.owned(state, pending.id) > pending.owned) {
        this.buildingsPlaced++;
        this.spent += balance.buildings.types[pending.id]?.price ?? 0;
        this.shopPending = null;
        this.placeAttempt = 0;
      } else if (state.tick - pending.sentAtTick > SHOP_ANSWER_TICKS) {
        this.shopSkip |= 1 << pending.index; // no answer: give up on that entry this build
        this.shopPending = null;
        this.placeAttempt = 0;
      }
      return;
    }
    const self = this.shopSelf;
    self.wallet = me.wallet;
    self.weapon0 = me.weapon0;
    self.weapon1 = me.weapon1;
    self.active = this.hands;
    self.level0 = me.level0; // Story 5.1
    self.level1 = me.level1;
    self.gear = me.gear; // Story 5.11
    // Story 5.13: weapons and gear only from my current offer (none yet: those entries are skipped).
    const offer = this.offer && this.offer.build === state.wave ? this.offer : null;
    const i = botShopNext(balance, self, (t) => this.owned(state, t), this.list, this.shopSkip, offer);
    if (i < 0) {
      this.shopDone = true;
      this.swapPending = this.hands !== me.active;
      return;
    }
    const id = this.list[i] as string;
    const up = upgradeEntryWeapon(id);
    if (up !== null) {
      this.room.send(C2S.SHOP_UPGRADE, { weapon: up }); // Story 5.1
      this.shopPending = { kind: "upgrade", index: i, id: up, owned: levelOf(me, up) + 1, sentAtTick: state.tick, bought: false };
      return;
    }
    const card = cardItem(balance, id);
    if (card && offer) {
      // Story 5.13: the card on my offer (botShopNext found it unsold), naming the offer I saw.
      const c = botCardIndex(offer, id);
      const slot = card.kind === "weapon" ? botWeaponSlot(self) : null;
      this.room.send(C2S.SHOP_BUY, { build: offer.build, rev: offer.rev, card: c, item: id, ...(slot === null ? {} : { slot }) });
      this.shopPending = { kind: card.kind, index: i, id, owned: card.kind === "gear" ? gearBit(balance, id) : 0, sentAtTick: state.tick, bought: false };
      return;
    }
    if (this.placeAttempt >= botPlaceTries(balance) || !botPlaceCandidate(balance, id, me.x, me.y, this.placeAttempt, this.spot)) {
      this.shopSkip |= 1 << i; // no free spot around me: next entry
      this.placeAttempt = 0;
      return;
    }
    this.placeAttempt++;
    this.room.send(C2S.BUILDING_PLACE, { type: id, gx: this.spot.gx, gy: this.spot.gy, rot: this.spot.rot });
    this.shopPending = { kind: "building", index: i, id, owned: this.owned(state, id), sentAtTick: state.tick, bought: false };
  }

  private shopBought(m: ShopBought): void {
    const p = this.shopPending;
    if (!p || (p.kind !== "weapon" && p.kind !== "gear") || p.id !== m.item) return;
    this.purchases.push(`${m.item}@W${this.waveNumber + 1}`);
    this.spent += cardPrice(balance, m.item, this.offer?.build ?? 0) ?? 0;
    if (m.slot !== undefined) this.hands = m.slot;
    p.bought = true; // cleared once the state shows the weapon / gear bit (shopStep)
  }

  private shopRefused(m: ShopRefused): void {
    const p = this.shopPending;
    if (!p || (p.kind !== "weapon" && p.kind !== "gear")) return;
    this.log({ msg: "bot_shop_refused", bot: this.name, item: m.item, error: m.error });
    this.shopSkip |= 1 << p.index;
    this.shopPending = null;
  }

  /** Story 5.1: `shop.upgraded`; the pending entry clears once the state shows the level. */
  private shopUpgraded(m: ShopUpgraded): void {
    const p = this.shopPending;
    if (!p || p.kind !== "upgrade" || p.id !== m.weapon) return;
    this.purchases.push(`upgrade:${m.weapon}@W${this.waveNumber + 1}`);
    this.spent += upgradePrice(balance, m.weapon);
    p.bought = true;
  }

  private shopUpgradeRefused(m: ShopUpgradeRefused): void {
    const p = this.shopPending;
    if (!p || p.kind !== "upgrade") return;
    this.log({ msg: "bot_upgrade_refused", bot: this.name, weapon: m.weapon, error: m.error });
    this.shopSkip |= 1 << p.index;
    this.shopPending = null;
  }

  /** Story 5.11: `shop.bought_item`; the pending entry clears once the state shows the gear bit. */
  private shopBoughtItem(m: ShopBoughtItem): void {
    const p = this.shopPending;
    if (!p || p.kind !== "gear" || p.id !== m.item) return;
    this.purchases.push(`${m.item}@W${this.waveNumber + 1}`);
    this.spent += botGearPrice(balance, m.item) ?? 0;
    p.bought = true;
  }

  private shopRefusedItem(m: ShopRefusedItem): void {
    const p = this.shopPending;
    if (!p || p.kind !== "gear") return;
    this.log({ msg: "bot_item_refused", bot: this.name, item: m.item, error: m.error });
    this.shopSkip |= 1 << p.index;
    this.shopPending = null;
  }

  private placeRefused(m: BuildingRefused): void {
    const p = this.shopPending;
    if (!p || p.kind !== "building") return;
    // A bad spot: the next candidate on the next step. Money or the cap: give up on that entry.
    if (m.reason !== "blocked") {
      this.shopSkip |= 1 << p.index;
      this.placeAttempt = 0;
    }
    this.shopPending = null;
  }

  /** The build phase is over: reset the shopping for the next one. */
  private endShopping(): void {
    this.shopDone = false;
    this.shopSkip = 0;
    this.shopPending = null;
    this.placeAttempt = 0;
    this.hands = -1;
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
    this.waveHordeBytes0 = this.hordeBytes;
    this.waveKeyframes0 = this.hordeStream.keyframes;
    this.waveHordeErrors0 = this.hordeStream.decodeErrors + this.hordeStream.brokenChain;
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
      hordeKBps: seconds > 0 ? r1((this.hordeBytes - this.waveHordeBytes0) / 1024 / seconds) : 0,
      keyframesPerS: seconds > 0 ? Math.round(((this.hordeStream.keyframes - this.waveKeyframes0) / seconds) * 100) / 100 : 0,
      hordeDecodeErrors: this.hordeStream.decodeErrors + this.hordeStream.brokenChain - this.waveHordeErrors0,
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
