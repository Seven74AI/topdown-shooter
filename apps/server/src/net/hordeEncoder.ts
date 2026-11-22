import {
  BYTES,
  HORDE_BACKPRESSURE_BYTES,
  HORDE_MAX_FRAME_BYTES,
  HORDE_VIEW_MARGIN_M,
  ZOMBIE_POOL_CAPACITY,
  ZOMBIE_STATE,
  hordeFrameBytes,
  inRect,
  packTypeState,
  quantizeHeading,
  queryRect,
  rebuildGrid,
  viewRect,
  writeHordeHeader,
  writeHordeRecord,
  zombieNetId,
  type Rect,
  type World,
} from "@topdown/shared";

/** Movement shorter than this keeps the last heading (a zombie standing still doesn't snap to +x). */
export const HEADING_MIN_MOVE_M = 1e-4;

/** The slice of a Colyseus client the encoder uses (tests pass fakes). */
export interface HordeClient {
  sendBytes(type: number, bytes: Uint8Array): void;
  /** The `ws` socket; `bufferedAmount` is what it has not written yet. */
  readonly ref: unknown;
}

/** Per-client counters (AC 4, Task 9). `horde_stats` logs them on `wave.ended`. */
export interface HordeStats {
  framesSent: number;
  framesSkipped: number;
  /** Payload bytes plus the 2-byte Colyseus header (`[protocol][type]`) of each frame sent. */
  bytesSent: number;
}

export const newHordeStats = (): HordeStats => ({ framesSent: 0, framesSkipped: 0, bytesSent: 0 });

/** `[ROOM_DATA_BYTES][type]` in front of every frame: the type 1 is a 1-byte number. */
export const COLYSEUS_BYTES_HEADER = 2;

const bufferedAmount = (ref: unknown): number => {
  const b = (ref as { bufferedAmount?: unknown } | null)?.bufferedAmount;
  return typeof b === "number" ? b : 0;
};

/**
 * Builds and sends horde frames (Story 2.5), one encoder per room. Preallocated: a tick allocates
 * nothing here (Colyseus's own `sendBytes` copies the payload into a fresh frame).
 *
 * Per tick: `prepare(world)` once (grid rebuild, headings, rusher list), then `send` per client:
 * the zombies inside the client's view rectangle plus HORDE_VIEW_MARGIN_M, plus every rusher
 * (the rush markers and edge arrows need off-screen ones), each once.
 */
export class HordeEncoder {
  private readonly bytes = new Uint8Array(HORDE_MAX_FRAME_BYTES);
  private readonly view = new DataView(this.bytes.buffer);
  /** `bytes.subarray(0, frameBytes(n))` for every count n, made once: a send creates no view. */
  private readonly frames: Uint8Array[];
  private readonly ids: Int32Array;
  private readonly heading: Uint8Array;
  private readonly lastGeneration: Int16Array;
  private readonly rushers: Int32Array;
  private rusherCount = 0;
  private readonly rect: Rect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  private tick = 0;

  constructor(private readonly capacity = ZOMBIE_POOL_CAPACITY) {
    this.ids = new Int32Array(capacity);
    this.heading = new Uint8Array(capacity);
    this.lastGeneration = new Int16Array(capacity).fill(-1);
    this.rushers = new Int32Array(capacity);
    this.frames = Array.from({ length: capacity + 1 }, (_, n) => this.bytes.subarray(0, hordeFrameBytes(n)));
  }

  /**
   * Once per tick, after the step. Rebuilds `world.zombieGrid` (zombies moved after the AI's own
   * rebuild and the wave director spawned new ones; combat rebuilds it again before any sim query,
   * so this never changes the simulation), then headings from this tick's movement.
   */
  prepare(world: World): void {
    const z = world.zombies;
    rebuildGrid(world.zombieGrid, z.aliveIds, z.aliveCount, z.x, z.y);
    this.tick = world.tick;
    this.rusherCount = 0;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      const gen = z.generation[id] as number;
      if (this.lastGeneration[id] !== gen) {
        this.lastGeneration[id] = gen; // a new zombie in this slot: no heading from the dead one
        this.heading[id] = 0;
      }
      const dx = (z.x[id] as number) - (z.prevX[id] as number);
      const dy = (z.y[id] as number) - (z.prevY[id] as number);
      if (dx * dx + dy * dy > HEADING_MIN_MOVE_M * HEADING_MIN_MOVE_M) this.heading[id] = quantizeHeading(dx, dy);
      if (z.state[id] === ZOMBIE_STATE.RUSH) this.rushers[this.rusherCount++] = id;
    }
  }

  /**
   * Builds the frame for a view centred on (px, py) into the scratch buffer. Returns it (a view
   * of the scratch buffer: valid until the next call).
   */
  encode(world: World, px: number, py: number): Uint8Array {
    const z = world.zombies;
    const r = viewRect(world.map, px, py, HORDE_VIEW_MARGIN_M, this.rect);
    let n = queryRect(world.zombieGrid, z.x, z.y, r.minX, r.minY, r.maxX, r.maxY, this.ids);
    for (let k = 0; k < this.rusherCount && n < this.capacity; k++) {
      const id = this.rushers[k] as number;
      if (!inRect(r, z.x[id] as number, z.y[id] as number)) this.ids[n++] = id; // inside ones are in already
    }
    const view = this.view;
    for (let i = 0; i < n; i++) {
      const id = this.ids[i] as number;
      writeHordeRecord(
        view,
        i,
        zombieNetId(id, z.generation[id] as number),
        z.x[id] as number,
        z.y[id] as number,
        this.heading[id] as number,
        packTypeState(z.type[id] as number, z.state[id] as number),
      );
    }
    writeHordeHeader(view, this.tick, n);
    return this.frames[n] as Uint8Array;
  }

  /**
   * Sends one frame to `client`, unless its socket holds more than HORDE_BACKPRESSURE_BYTES: then
   * the frame is skipped, never queued (AC 4). Returns the bytes sent (0 when skipped).
   */
  send(world: World, client: HordeClient, stats: HordeStats, px: number, py: number): number {
    if (bufferedAmount(client.ref) > HORDE_BACKPRESSURE_BYTES) {
      stats.framesSkipped++;
      return 0;
    }
    const frame = this.encode(world, px, py);
    client.sendBytes(BYTES.HORDE_FRAME, frame); // copied by Colyseus (`getMessageBytes.raw`): reusable at once
    stats.framesSent++;
    stats.bytesSent += frame.length + COLYSEUS_BYTES_HEADER;
    return frame.length;
  }
}
