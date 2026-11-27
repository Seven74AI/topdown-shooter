import { cutText, REPORT_LINE_MAX, REPORT_LINES_MAX } from "@topdown/shared";

/**
 * Story 10.6 (B6, AC 1): the last 200 log lines since boot, kept in every build and sent ONLY by a report.
 * A fixed 200-slot array plus head and count: no growth. Lines are built only on events (console calls, window errors,
 * `note()` at the net and run seams), never per frame or per tick. Each line is `HH:MM:SS.mmm level text`, cut to 300.
 *
 * B7: `note()` fields are ids, codes and numbers only: never names, usernames, tokens, cookies or IPs
 * (`tools/checks/clientLogPrivacy.test.ts` checks every call site).
 */
export type LogLevel = "info" | "warn" | "error" | "note";
export type NoteValue = string | number | boolean | null | undefined;

export class ClientLog {
  private readonly slots: string[];
  private head = 0; // next write
  private count = 0;

  constructor(readonly capacity = REPORT_LINES_MAX) {
    this.slots = new Array<string>(capacity).fill("");
  }

  push(level: LogLevel, text: string, nowMs = Date.now()): void {
    const line = `${stamp(nowMs)} ${level} ${text}`;
    this.slots[this.head] = cutText(line, REPORT_LINE_MAX); // review M1: never half an emoji
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /** A net / run event: `kind k=v k=v`. Values are ids, codes and numbers (B7). */
  note(kind: string, fields?: Readonly<Record<string, NoteValue>>): void {
    let text = kind;
    if (fields) for (const k in fields) text += ` ${k}=${String(fields[k])}`;
    this.push("note", text);
  }

  /** Oldest first (a copy: called only when a report is made or shown). */
  lines(): string[] {
    const out: string[] = [];
    const start = (this.head - this.count + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i++) out.push(this.slots[(start + i) % this.capacity] as string);
    return out;
  }

  get size(): number {
    return this.count;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");
function stamp(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** The one log of this tab. */
export const clientLog = new ClientLog();

const fmt = (args: readonly unknown[]): string => {
  let s = "";
  for (const a of args) {
    if (s.length > REPORT_LINE_MAX) break;
    let part: string;
    if (typeof a === "string") part = a;
    else if (a instanceof Error) part = errorText(a);
    else {
      try {
        part = JSON.stringify(a) ?? String(a);
      } catch {
        part = String(a);
      }
    }
    s += (s ? " " : "") + part;
  }
  return s;
};

/** The message and the first 3 stack lines. */
export function errorText(e: unknown): string {
  if (e instanceof Error) {
    const stack = (e.stack ?? "").split("\n").filter((l) => l.trim().startsWith("at ") || l.includes("@"));
    return [`${e.name}: ${e.message}`, ...stack.slice(0, 3).map((l) => l.trim())].join(" | ");
  }
  return String(e);
}

let installed = false;
type ConsoleLike = Pick<Console, "info" | "warn" | "error">;
/** The window's event slice (no DOM types: tools typecheck this file through textureRegistry without the DOM lib). */
type WindowLike = { addEventListener(type: string, listener: (e: never) => void): void };
type ErrorEventLike = { error?: unknown; message?: string; filename?: string; lineno?: number };

/** First thing in `main.ts`: wraps console.info / warn / error (the original still runs) and the window error events. */
export function installClientLog(log: ClientLog = clientLog, con: ConsoleLike = console, win: WindowLike | undefined = (globalThis as { window?: WindowLike }).window): void {
  if (log === clientLog) {
    if (installed) return;
    installed = true;
  }
  for (const level of ["info", "warn", "error"] as const) {
    const original = con[level].bind(con);
    con[level] = (...args: unknown[]) => {
      try {
        log.push(level, fmt(args));
      } catch {
        /* never break a console call */
      }
      original(...args);
    };
  }
  if (!win) return;
  win.addEventListener("error", (ev: ErrorEventLike) => {
    log.push("error", ev.error ? errorText(ev.error) : `${ev.message ?? "error"} ${ev.filename ?? ""}:${ev.lineno ?? 0}`);
  });
  win.addEventListener("unhandledrejection", (e: { reason?: unknown }) => {
    log.push("error", `unhandledrejection ${errorText(e.reason)}`);
  });
}

/**
 * B1, AC 3: the room the report is about, written at the same seams as the notes (room join, phase changes). Ids
 * only (B7).
 */
export const runContext: { roomId: string | null; phase: string | null } = {
  roomId: null,
  phase: null,
};

/**
 * B1, AC 3: read when a report is made (never per frame). main.ts registers the probes: the run seed and wave from the
 * Game scene, and the WebGL renderer string from the game's own context (never a second context: on a phone a new one
 * can push the game's out).
 */
export const reportProbes: { run: () => { seed: number; wave: number } | null; renderer: () => string | undefined } = {
  run: () => null,
  renderer: () => undefined,
};
