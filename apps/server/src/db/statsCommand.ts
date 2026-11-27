/**
 * Story 10.7 (AC 8; designer Q1 = C, Q2 = A, Q3 = A): `npm run stats` as text. Pure: the finished rows in, the lines
 * out (`statsCli.ts` reads the database). Names are never printed: a group is its size and a short hash of its
 * account set.
 *
 * - Runs per week: ISO week of `ended_at` (Monday-based, this process's time zone); abandoned runs are their own
 *   column (Q2 = A) and are left out of the three other stats. An endless wipe (ending `endless`, B-code 10.7-B10) is a
 *   normal run everywhere (not extracted).
 * - Each group's first 3 runs: group = the sorted set of accounts in a run (merged guests already mapped by the query,
 *   B6; a deleted account is its own anonymous member, so its run's group is unique).
 * - Runs to first extraction per account, as a distribution.
 * - Weapons bought (Q1 = C): each weapon's share of RUNS (a run counts a weapon once if any seat bought it; review
 *   nit), `⚠ over half` above 50 %.
 */
import { createHash } from "node:crypto";
import type { StatsRun, StatsSeat } from "./runResultsRepo";

export const STATS_USAGE = "usage: npm run stats -w @topdown/server -- [--since YYYY-MM-DD]";

/** `--since YYYY-MM-DD` (local midnight) or nothing. */
export function parseStatsArgs(argv: readonly string[]): { since: Date | null } | { error: string } {
  if (argv.length === 0) return { since: null };
  if (argv.length !== 2 || argv[0] !== "--since") return { error: STATS_USAGE };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(argv[1] as string);
  if (!m) return { error: STATS_USAGE };
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return { error: STATS_USAGE };
  return { since: d };
}

/** The ISO week of a date in local time: `2026-W48`, and that week's Monday (`Mon 23 Nov`). */
export function isoWeek(d: Date): { key: string; monday: string } {
  const day = (d.getDay() + 6) % 7; // Monday 0
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  const thursday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3);
  const jan4 = new Date(thursday.getFullYear(), 0, 4);
  const week1Monday = new Date(jan4.getFullYear(), 0, 4 - ((jan4.getDay() + 6) % 7));
  const week = 1 + Math.round((monday.getTime() - week1Monday.getTime()) / (7 * 24 * 3600 * 1000));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return { key: `${thursday.getFullYear()}-W${String(week).padStart(2, "0")}`, monday: `Mon ${monday.getDate()} ${months[monday.getMonth()]}` };
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const shortHash = (ids: readonly string[]): string => createHash("sha256").update(ids.join(",")).digest("hex").slice(0, 6);
const pct = (n: number, of: number): number => (of === 0 ? 0 : Math.round((100 * n) / of));

export function formatStats(runs: readonly StatsRun[], seats: readonly StatsSeat[], since: Date | null = null): string[] {
  const out: string[] = [];
  if (runs.length === 0) return ["No finished runs yet"];
  out.push(since ? `Run stats (finished runs since ${since.toDateString()})` : "Run stats (all finished runs)");

  // 1. Runs per week (abandoned in their own column, Q2 = A).
  out.push("", "Runs per week");
  const weeks = new Map<string, { monday: string; runs: number; abandoned: number }>();
  for (const r of runs) {
    const w = isoWeek(r.endedAt);
    const row = weeks.get(w.key) ?? weeks.set(w.key, { monday: w.monday, runs: 0, abandoned: 0 }).get(w.key)!;
    if (r.ending === "abandoned") row.abandoned++;
    else row.runs++;
  }
  for (const [key, w] of [...weeks.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) out.push(`  ${key} (${w.monday})  ${plural(w.runs, "run")} · ${w.abandoned} abandoned`);

  // The three other stats read played runs only (Q2 = A), oldest first.
  const played = runs.filter((r) => r.ending !== "abandoned");
  const byRun = new Map<string, StatsSeat[]>();
  for (const s of seats) (byRun.get(s.runId) ?? byRun.set(s.runId, []).get(s.runId)!).push(s);
  const membersOf = (r: StatsRun): string[] => {
    const list = byRun.get(r.id) ?? [];
    const ids = new Set<string>();
    list.forEach((s, i) => ids.add(s.member ?? `deleted:${r.id}:${i}`)); // B6: a deleted account is alone
    return [...ids].sort();
  };

  // 2. Each group's first 3 runs.
  out.push("", "Wave reached in each group's first 3 runs (✓ = extracted)");
  const groups = new Map<string, { size: number; waves: string[] }>();
  for (const r of played) {
    const ids = membersOf(r);
    if (ids.length === 0) continue;
    const key = ids.join(",");
    const g = groups.get(key) ?? groups.set(key, { size: ids.length, waves: [] }).get(key)!;
    if (g.waves.length < 3) g.waves.push(`${r.waveReached}${r.extracted ? "✓" : ""}`);
  }
  if (groups.size === 0) out.push("  (none)");
  for (const [key, g] of groups) out.push(`  ${plural(g.size, "player")} · group ${shortHash(key.split(","))} · ${g.waves.join(", ")}`);

  // 3. Runs to first extraction per account.
  out.push("", "Runs to first extraction (per account)");
  const perAccount = new Map<string, { runs: number; first: number | null }>();
  for (const r of played) {
    for (const id of new Set((byRun.get(r.id) ?? []).map((s) => s.member).filter((m): m is string => m !== null))) {
      const a = perAccount.get(id) ?? perAccount.set(id, { runs: 0, first: null }).get(id)!;
      if (a.first !== null) continue;
      a.runs++;
      if (r.extracted) a.first = a.runs;
    }
  }
  if (perAccount.size === 0) out.push("  (none)");
  else {
    const dist = new Map<number, number>();
    let notYet = 0;
    for (const a of perAccount.values()) {
      if (a.first === null) notYet++;
      else dist.set(a.first, (dist.get(a.first) ?? 0) + 1);
    }
    const parts = [...dist.entries()].sort(([a], [b]) => a - b).map(([n, c], i) => `${plural(n, "run")}: ${i === 0 ? plural(c, "account") : c}`);
    parts.push(`not yet: ${notYet}`);
    out.push(`  ${parts.join(" · ")}`);
  }

  // 4. Weapons bought (Q1 = C): each weapon's share of runs (a run counts it once if any of its seats bought it).
  const withSeats = played.filter((r) => (byRun.get(r.id) ?? []).length > 0);
  out.push("", `Weapons bought (share of ${plural(withSeats.length, "run")})`);
  if (withSeats.length === 0) out.push("  (none)");
  else {
    const count = new Map<string, number>();
    let none = 0;
    for (const r of withSeats) {
      const ws = new Set((byRun.get(r.id) ?? []).flatMap((s) => (s.loadout === "" ? [] : s.loadout.split("+"))));
      if (ws.size === 0) none++;
      for (const w of ws) count.set(w, (count.get(w) ?? 0) + 1);
    }
    const n0 = withSeats.length;
    const lines = [...count.entries()].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1));
    const width = Math.max(10, ...lines.map(([w]) => w.length));
    for (const [w, n] of lines) out.push(`  ${w.padEnd(width)} ${String(pct(n, n0)).padStart(3)} %${2 * n > n0 ? "  ⚠ over half" : ""}`);
    out.push(`  ${"(none)".padEnd(width)} ${String(pct(none, n0)).padStart(3)} %  no weapon bought`);
  }
  return out;
}
