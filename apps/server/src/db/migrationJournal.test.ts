import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_FOLDER } from "./migrate";

/**
 * Epic 7 retro E7-A3: Drizzle's migrator applies a migration only when its journal `when` is newer than the last one
 * the database recorded, so an entry whose `when` is older than an applied one is SKIPPED silently (a hand-renamed
 * parallel migration). The rule (game-architecture.md, next to the migrations): the second story to land regenerates
 * its migration on top of master. This check fails CI when the journal and the files disagree.
 */
interface Entry {
  idx: number;
  when: number;
  tag: string;
}

/** Every problem with a journal against the `.sql` file names in the folder (empty = fine). */
function journalProblems(entries: readonly Entry[], sqlFiles: readonly string[]): string[] {
  const out: string[] = [];
  const files = [...sqlFiles].sort();
  entries.forEach((e, i) => {
    if (e.idx !== i) out.push(`entry ${i} (${e.tag}) has idx ${e.idx}`);
    if (!Number.isInteger(e.when) || e.when <= 0) out.push(`entry ${i} (${e.tag}) has a bad when ${e.when}`);
    const prev = entries[i - 1];
    if (prev && !(e.when > prev.when)) out.push(`entry ${i} (${e.tag}) when ${e.when} is not after entry ${i - 1} (${prev.tag}) when ${prev.when}: Drizzle would skip it — regenerate it on top of master`);
    if (!/^\d{4}_/.test(e.tag) || Number(e.tag.slice(0, 4)) !== i) out.push(`entry ${i} has tag ${e.tag}: the file number must equal its position`);
  });
  const tags = entries.map((e) => `${e.tag}.sql`);
  if (tags.join("\n") !== files.join("\n")) out.push(`journal order [${tags.join(", ")}] ≠ files [${files.join(", ")}]`);
  return out;
}

describe("E7-A3: the Drizzle migration journal", () => {
  it("idx 0…n−1, tags = the .sql files in file order, `when` strictly increasing", () => {
    const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8")) as { entries: Entry[] };
    const sql = readdirSync(MIGRATIONS_FOLDER).filter((f) => f.endsWith(".sql"));
    expect(journal.entries.length).toBeGreaterThanOrEqual(6); // 0000_init … 0005_saved_runs at the time of writing
    expect(journalProblems(journal.entries, sql)).toEqual([]);
  });

  it("the check catches a renamed parallel migration, an older `when`, a missing file and a gap", () => {
    const ok: Entry[] = [
      { idx: 0, when: 100, tag: "0000_a" },
      { idx: 1, when: 200, tag: "0001_b" },
      { idx: 2, when: 300, tag: "0002_c" },
    ];
    const files = ["0000_a.sql", "0001_b.sql", "0002_c.sql"];
    expect(journalProblems(ok, files)).toEqual([]);
    // story B landed second but kept its older generated `when` (renamed 0001 → 0002 by hand)
    const renamed = [ok[0]!, { idx: 1, when: 250, tag: "0001_c" }, { idx: 2, when: 200, tag: "0002_b" }];
    expect(journalProblems(renamed, ["0000_a.sql", "0001_c.sql", "0002_b.sql"]).join("\n")).toMatch(/not after entry 1/);
    expect(journalProblems([ok[0]!, ok[1]!, { ...ok[2]!, when: 200 }], files).join("\n")).toMatch(/not after/); // equal is not newer
    expect(journalProblems(ok, ["0000_a.sql", "0001_b.sql"]).join("\n")).toMatch(/≠ files/);
    expect(journalProblems(ok, [...files, "0003_d.sql"]).join("\n")).toMatch(/≠ files/);
    expect(journalProblems([ok[0]!, { ...ok[2]!, idx: 1 }], ["0000_a.sql", "0002_c.sql"]).join("\n")).toMatch(/file number must equal/);
    expect(journalProblems([ok[1]!, ok[0]!, ok[2]!], files).join("\n")).toMatch(/idx/);
  });
});
