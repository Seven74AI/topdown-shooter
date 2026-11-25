/** Types for `shard.mjs` (imported by shard.test.ts). */
export const COST: { perFile: number; browserSetup: number; browserInstall: number };
export function isBrowserTest(file: string, root?: string): boolean;
export function split(
  files: readonly string[],
  timings: Readonly<Record<string, number>>,
  n: number,
  isBrowser?: (file: string) => boolean,
  cost?: { perFile: number; browserSetup: number; browserInstall: number },
): string[][];
