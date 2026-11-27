/**
 * Story 10.6 (AC 7, B7): the operator's `reports` command (run by `reportsCli.ts`). The list: created time, code,
 * account kind, wave, room id, browser short name and the note's first 80 characters. `--full`, `--id` or `--code`
 * print the whole report(s): note, device info and every log line. Exit codes: 0 done, 1 nothing found, 2 usage.
 * Everything a player wrote is printed through `visible` (review M2): it is untrusted text, never instructions.
 */
import { reportCodeSchema } from "@topdown/shared";
import type { ReportRow, ReportsRepo } from "./reportsRepo";

export const REPORTS_USAGE = "usage: npm run reports -w @topdown/server -- [--limit 20] [--code K7QF] [--id <uuid>] [--full]";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Args {
  limit: number;
  code?: string;
  id?: string;
  full: boolean;
}

export function parseReportsArgs(argv: readonly string[]): Args | null {
  const out: Args = { limit: 20, full: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--full") out.full = true;
    else if (a === "--limit" && next !== undefined && /^\d+$/.test(next) && Number(next) >= 1 && Number(next) <= 500) {
      out.limit = Number(next);
      i++;
    } else if (a === "--code" && next !== undefined && reportCodeSchema.safeParse(next.toUpperCase()).success) {
      out.code = next.toUpperCase();
      i++;
    } else if (a === "--id" && next !== undefined && UUID.test(next)) {
      out.id = next.toLowerCase();
      i++;
    } else return null;
  }
  return out;
}

/** "Chrome 131", "Safari", "Firefox 133"… from the brands or the user agent. */
export function browserShortName(r: Pick<ReportRow, "payload">): string {
  const d = r.payload?.device;
  if (!d) return "?";
  const brand = d.brands?.find((b) => !/not.?a.?brand|chromium/i.test(b));
  if (brand) return brand.replace(/^Google /, "");
  const ua = d.userAgent ?? "";
  const m = /(Firefox|Edg|OPR|SamsungBrowser|CriOS|FxiOS|Chrome)\/(\d+)/.exec(ua);
  if (m) return `${m[1] === "Edg" ? "Edge" : m[1]} ${m[2]}`;
  if (/Safari\//.test(ua)) return `Safari ${/Version\/(\d+)/.exec(ua)?.[1] ?? ""}`.trim();
  return "?";
}

const iso = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);

/**
 * Review M2: report text is untrusted player input. Every C0 / C1 control character (ESC sequences that clear the
 * screen or write the clipboard, OSC 52, …), the bidi / zero-width / line-separator controls (U+061C, U+200B–U+200F,
 * U+2028–U+202E, U+2066–U+2069, U+FEFF) are printed as visible escapes
 * (`\x1b`, `\u202e`); `keepNewlines` keeps `\n` (the full view's note).
 */
export function visible(s: string, keepNewlines = false): string {
  // eslint-disable-next-line no-control-regex -- Story 10.6 review M1/M2: matching control characters is the point
  return s.replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g, (c) => {
    if (keepNewlines && c === "\n") return c;
    const code = c.charCodeAt(0);
    return code <= 0xff ? `\\x${code.toString(16).padStart(2, "0")}` : `\\u${code.toString(16).padStart(4, "0")}`;
  });
}
const oneLine = (s: string) => visible(s.replace(/[ \t\r\n]+/g, " ").trim());

function summary(r: ReportRow): string {
  const wave = r.payload?.wave === undefined ? "-" : String(r.payload.wave);
  const note = oneLine(r.note);
  return [iso(r.createdAt), r.code, r.accountKind.padEnd(7), `w${wave}`.padEnd(4), visible(r.payload?.roomId ?? "-").padEnd(10), visible(browserShortName(r)).padEnd(12), note.length > 80 ? `${note.slice(0, 79)}…` : note].join("  ");
}

function full(r: ReportRow, out: (line: string) => void): void {
  out(`report ${r.code}  ${r.id}  ${iso(r.createdAt)} UTC  ${r.accountKind}`);
  // Re-review nit: the note's continuation lines are indented, so a note can't fake the "log (N lines):" structure.
  out(`note: ${r.note === "" ? "(none)" : visible(r.note, true).replace(/\n/g, "\n      ")}`);
  const { lines, device, ...ctx } = r.payload ?? { lines: [], device: undefined };
  out(`run: ${visible(JSON.stringify(ctx))}`);
  out(`device: ${visible(JSON.stringify(device ?? null))}`);
  out(`log (${lines?.length ?? 0} lines):`);
  for (const l of lines ?? []) out(`  ${visible(l)}`);
  out("");
}

export async function runReportsCommand(argv: readonly string[], repo: Pick<ReportsRepo, "list" | "byCode" | "byId">, out: (line: string) => void): Promise<number> {
  const args = parseReportsArgs(argv);
  if (args === null) {
    out(REPORTS_USAGE);
    return 2;
  }
  let rows: ReportRow[];
  if (args.id !== undefined) {
    const r = await repo.byId(args.id);
    rows = r ? [r] : [];
  } else if (args.code !== undefined) rows = await repo.byCode(args.code);
  else rows = await repo.list(args.limit);
  if (rows.length === 0) {
    out("no reports");
    return args.id !== undefined || args.code !== undefined ? 1 : 0;
  }
  if (args.full || args.id !== undefined || args.code !== undefined) for (const r of rows) full(r, out);
  else for (const r of rows) out(summary(r));
  return 0;
}
