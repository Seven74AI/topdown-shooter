import type { z } from "zod";
import { canonicalJson, fnv1a32 } from "../core/hash";
import { balanceFileSchemas, type BalanceFileName } from "./balanceSchema";
import weapons from "./balance/weapons.json" with { type: "json" };
import zombies from "./balance/zombies.json" with { type: "json" };
import waves from "./balance/waves.json" with { type: "json" };
import player from "./balance/player.json" with { type: "json" };
import controls from "./balance/controls.json" with { type: "json" };
import economy from "./balance/economy.json" with { type: "json" };

type Schemas = typeof balanceFileSchemas;

/** Raw (unvalidated) contents of every balance file. */
export type RawBalanceFiles = { [K in BalanceFileName]: unknown };

/** Every tunable gameplay number, validated and frozen. Systems read it via `world.balance`. */
export type Balance = { readonly version: string } & {
  readonly [K in BalanceFileName]: DeepReadonly<z.output<Schemas[K]>>;
};

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

/** Thrown when a balance file is invalid; the message names the file and the key. */
export class BalanceError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(issues.join("\n"));
    this.name = "BalanceError";
  }
}

const BUNDLED: RawBalanceFiles = { weapons, zombies, waves, player, controls, economy };

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/**
 * Validates balance files into one typed, frozen `Balance` object.
 * With no argument it loads the JSON bundled with the package.
 */
export function loadBalance(raw: RawBalanceFiles = BUNDLED): Balance {
  const issues: string[] = [];
  const parsed: Record<string, unknown> = {};
  for (const name of Object.keys(balanceFileSchemas) as BalanceFileName[]) {
    if (!(name in raw) || raw[name] === undefined) {
      issues.push(`${name}.json: file missing`);
      continue;
    }
    const result = balanceFileSchemas[name].safeParse(raw[name]);
    if (result.success) {
      parsed[name] = result.data;
    } else {
      for (const issue of result.error.issues) {
        const path = issue.path.map(String).join(".") || "(root)";
        issues.push(`${name}.json: ${path}: ${issue.message}`);
      }
    }
  }
  if (issues.length > 0) throw new BalanceError(issues);

  const version = fnv1a32(canonicalJson(parsed)).toString(16).padStart(8, "0");
  return deepFreeze({ version, ...parsed }) as Balance;
}

/** A deep copy of the balance files bundled with the package (to apply overrides to). */
export function bundledBalanceFiles(): RawBalanceFiles {
  return JSON.parse(JSON.stringify(BUNDLED)) as RawBalanceFiles;
}

/** One override: a value at a dotted path inside one balance file, e.g. `["weapons", "machete.arcDeg", 120]`. */
export type BalanceOverride = readonly [file: BalanceFileName, path: string, value: number];

/**
 * Returns a copy of `raw` with each override applied (Story 1.12 live tuning). Overrides of keys
 * that don't exist are ignored. The result still goes through `loadBalance()`, so an invalid value
 * fails validation like any balance edit.
 */
export function withOverrides(raw: RawBalanceFiles, overrides: readonly BalanceOverride[]): RawBalanceFiles {
  const out = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  for (const [file, path, value] of overrides) {
    const keys = path.split(".");
    let node = out[file] as Record<string, unknown> | undefined;
    for (let i = 0; node && i < keys.length - 1; i++) node = node[keys[i] as string] as Record<string, unknown> | undefined;
    const last = keys[keys.length - 1] as string;
    if (node && typeof node === "object" && last in node) node[last] = value;
  }
  return out as RawBalanceFiles;
}
