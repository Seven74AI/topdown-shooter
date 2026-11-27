import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 10.4 (B7, AC 5): music streams after the game starts. No audio file exists today (all sound is synthesized at
 * run time: `audio/ambience.ts`, `audio/placeholderSfx.ts`), and this guard keeps the first load free of one: no audio
 * file may be named in `index.html` or in any module the entry (`src/main.ts`) loads statically. A later music track
 * (9.8 / 9.10) lives in a module loaded with `import()` and is fetched after the start screen.
 */
const ROOT = process.cwd();
const CLIENT = join(ROOT, "apps/client");
export const AUDIO_FILE = /["'`(=][^"'`()\s]*\.(?:mp3|ogg|oga|m4a|aac|wav|opus|weba|webm|flac)(?:[?#][^"'`)\s]*)?["'`)\s]/i;

/** Every module `entry` loads with a static import / re-export (dynamic `import()` and `import type` excluded). */
export function staticClosure(entry: string, read: (file: string) => string | null = readSource, find: (from: string, spec: string) => string | null = resolveImport): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  const spec = /(?:^|[;\n}])\s*(?:import(?!\s+type\b)(?:[^"'()]*?\bfrom)?|export(?!\s+type\b)[^"'()]*?\bfrom)\s*["']([^"']+)["']/g;
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    const src = read(file);
    if (src === null) continue;
    seen.add(file);
    for (const m of src.matchAll(spec)) {
      const target = find(file, (m[1] ?? "").split("?")[0] ?? "");
      if (target) queue.push(target);
    }
  }
  return [...seen];
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec === "@topdown/shared" ? join(ROOT, "packages/shared/src/index") : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (base === null) return null; // a package: no audio files in node_modules imports today
  for (const f of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (existsSync(f) && !f.endsWith("/") && /\.(ts|tsx|css|js)$/.test(f)) return f;
  return null;
}

function readSource(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

/** The first audio file reference in `text`, or null. */
export function audioRef(text: string): string | null {
  const m = AUDIO_FILE.exec(text);
  return m ? m[0] : null;
}

describe("Story 10.4 B7: no eager audio", () => {
  it("index.html names no audio file", () => {
    const html = readFileSync(join(CLIENT, "index.html"), "utf8");
    expect(html).toContain("boot-loader"); // liveness: the real page
    expect(audioRef(html)).toBeNull();
  });

  it("no module the entry loads statically names an audio file", () => {
    const files = staticClosure(join(CLIENT, "src/main.ts"));
    // Liveness: the walk really follows the import graph (scenes, UI, the synthesized audio, the shared package).
    for (const f of ["src/scenes/GameScene.ts", "src/ui/App.tsx", "src/audio/ambience.ts"]) expect(files).toContain(join(CLIENT, f));
    expect(files.some((f) => f.includes("packages/shared/src/"))).toBe(true);
    expect(files.length).toBeGreaterThan(100);
    const hits = files.flatMap((f) => {
      const ref = audioRef(readFileSync(f, "utf8"));
      return ref ? [`${f}: ${ref}`] : [];
    });
    expect(hits).toEqual([]);
  });

  it("fails on a doctored index.html and a doctored module (proof the guard bites)", () => {
    expect(audioRef('<audio src="/assets/theme-abc123.mp3" autoplay></audio>')).not.toBeNull();
    expect(audioRef('<link rel="preload" href="/music/night.ogg" as="audio">')).not.toBeNull();
    expect(audioRef('import track from "./music/boss.m4a";')).not.toBeNull();
    expect(audioRef('const u = new URL("../music/rain.opus?v=2", import.meta.url);')).not.toBeNull();
    expect(audioRef("<div>Music volume</div> <script src=/assets/main.js></script>")).toBeNull();
    const fake: Record<string, string> = {
      "/e/main.ts": 'import { a } from "./a";\nimport type { T } from "./t";\nconst lazy = () => import("./music");',
      "/e/a.ts": 'export * from "./b";',
      "/e/b.ts": 'export const url = "./theme.mp3";',
      "/e/t.ts": 'export const x = "./t.mp3";',
      "/e/music.ts": 'export const m = "./music.ogg";',
    };
    const closure = staticClosure("/e/main.ts", (f) => fake[f] ?? null, (from, spec) => `${resolve(dirname(from), spec)}.ts`);
    expect(closure.sort()).toEqual(["/e/a.ts", "/e/b.ts", "/e/main.ts"]);
    expect(closure.map((f) => audioRef(fake[f] ?? "")).filter(Boolean)).toHaveLength(1);
  });
});
