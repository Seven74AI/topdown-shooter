/**
 * Stories 8.4–8.6: plain JSON for the run save (`runSave.ts`). `toPlain` turns live World data into JSON values (typed
 * arrays → arrays of numbers, Maps → sorted `[key, value]` entries, Sets → sorted arrays, non-finite numbers → the
 * strings "NaN" / "Infinity" / "-Infinity"); `hydrate` writes such a value back INTO a freshly created structure of the
 * same kind, using the live structure as the schema (a typed array stays that typed array, a Map stays a Map, a key the
 * save does not have keeps its fresh default: that is how an older save picks up a new field). Pure, no Node.
 */

export type Plain = null | boolean | number | string | Plain[] | { [key: string]: Plain };

const NON_FINITE = new Set(["NaN", "Infinity", "-Infinity"]);

function isTypedArray(v: unknown): v is { length: number; [i: number]: number } & ArrayBufferView {
  return ArrayBuffer.isView(v) && !(v instanceof DataView);
}

const plainNumber = (n: number): Plain => (Number.isFinite(n) ? n : String(n));
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const keyOf = (k: unknown): string => (typeof k === "string" ? k : JSON.stringify(k));

/** Live data → JSON values (a deep copy: nothing in the result references the World). Functions are refused. */
export function toPlain(v: unknown): Plain {
  if (v === null || v === undefined) return null;
  switch (typeof v) {
    case "number":
      return plainNumber(v);
    case "boolean":
    case "string":
      return v;
    case "function":
    case "symbol":
    case "bigint":
      throw new Error(`toPlain: cannot save a ${typeof v}`);
  }
  if (isTypedArray(v)) {
    const out: Plain[] = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = plainNumber(v[i] as number);
    return out;
  }
  if (Array.isArray(v)) return v.map(toPlain);
  if (v instanceof Map) return [...v.entries()].sort(([a], [b]) => cmp(keyOf(a), keyOf(b))).map(([k, x]) => [toPlain(k), toPlain(x)]);
  if (v instanceof Set) return [...v].map(toPlain).sort((a, b) => cmp(keyOf(a), keyOf(b)));
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) throw new Error(`toPlain: cannot save a class instance (${(proto as { constructor?: { name?: string } }).constructor?.name ?? "?"})`);
  const out: { [key: string]: Plain } = {};
  for (const k of Object.keys(v as object).sort()) {
    const x = (v as Record<string, unknown>)[k];
    if (x === undefined) continue;
    out[k] = toPlain(x);
  }
  return out;
}

/** A saved number back (the non-finite strings included). */
export function fromPlainNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && NON_FINITE.has(v)) return Number(v);
  return fallback;
}

/** A JSON value copied into fresh live data with no template (plain objects, arrays, numbers). */
export function clonePlain<T = unknown>(v: Plain): T {
  if (v === null || typeof v !== "object") return (typeof v === "string" && NON_FINITE.has(v) ? Number(v) : v) as T;
  if (Array.isArray(v)) return v.map((x) => clonePlain(x)) as T;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v)) out[k] = clonePlain(v[k] as Plain);
  return out as T;
}

/**
 * Writes `plain` into `target` (a freshly created structure), key by key, keeping the target's containers: typed arrays
 * are filled element by element (a shorter save leaves the rest at their default, a longer one is cut), Maps and Sets
 * are cleared and refilled, arrays of objects are hydrated element by element (new elements are copies), plain objects
 * recurse, primitives are assigned. Keys of `plain` that the target lacks are copied in (an optional field).
 */
export function hydrate(target: object, plain: Plain): void {
  if (plain === null || typeof plain !== "object" || Array.isArray(plain)) throw new Error("hydrate: the saved value is not an object");
  const t = target as Record<string, unknown>;
  for (const k of Object.keys(plain)) t[k] = hydrateValue(t[k], plain[k] as Plain);
}

function hydrateValue(current: unknown, v: Plain): unknown {
  if (isTypedArray(current)) {
    if (!Array.isArray(v)) return current;
    const n = Math.min(current.length, v.length);
    for (let i = 0; i < n; i++) current[i] = fromPlainNumber(v[i]);
    return current;
  }
  if (current instanceof Map) {
    current.clear();
    if (Array.isArray(v)) for (const e of v) if (Array.isArray(e) && e.length === 2) current.set(clonePlain(e[0] as Plain), clonePlain(e[1] as Plain));
    return current;
  }
  if (current instanceof Set) {
    current.clear();
    if (Array.isArray(v)) for (const e of v) current.add(clonePlain(e));
    return current;
  }
  if (Array.isArray(current)) {
    if (!Array.isArray(v)) return current;
    for (let i = 0; i < v.length; i++) {
      const c = current[i];
      current[i] = c !== null && typeof c === "object" && v[i] !== null && typeof v[i] === "object" && !Array.isArray(v[i]) ? (hydrate(c, v[i] as Plain), c) : clonePlain(v[i] as Plain);
    }
    current.length = v.length;
    return current;
  }
  if (current !== null && typeof current === "object") {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return clonePlain(v);
    hydrate(current, v);
    return current;
  }
  if (typeof current === "number") return fromPlainNumber(v, current);
  return clonePlain(v);
}
