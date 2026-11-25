import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...p: string[]): string => readFileSync(join(__dirname, "..", "..", ...p), "utf8");
/** Source without comments (a commented-out line must not pass). */
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
/** The body of `name(…) {…}` in `src` (brace matched). */
function method(src: string, name: string): string {
  const at = src.search(new RegExp(`\\n  (private )?${name}\\(`));
  if (at < 0) throw new Error(`no ${name}`);
  let i = src.indexOf("{", src.indexOf(")", at));
  let depth = 0;
  const start = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(start, i + 1);
}

/** Story 8.10 (brief R2 wiring, brief 7 no per-tick allocation). */
describe("Story 8.10: the horde stream is wired and allocation-free", () => {
  it("RunInbox decodes every horde frame with its stream decoder from the join (D4), into the scene's sink", () => {
    const src = code(read("apps", "client", "src", "net", "session.ts"));
    expect(src).toMatch(/room\.onMessage\(BYTES\.HORDE_FRAME, \(b: Uint8Array\) => this\.receiveHorde\(b\)\)/);
    expect(method(src, "receiveHorde")).toMatch(/this\.hordeStream\.decode\(bytes, sink\)/);
  });

  it("NetSimHost hands the session its HordeDecoder (the buffer's sink, built on the session's stream decoder)", () => {
    const src = code(read("apps", "client", "src", "sim", "NetSimHost.ts"));
    expect(src).toMatch(/opts\.session\.onHorde\(this\.hordeStats\)/);
    expect(src).toMatch(/new HordeDecoder\(this\.horde, opts\.session\.hordeStream,/);
  });

  it("the ?debug=1 overlay prints `key N/s · err N` (AC 9)", () => {
    const src = code(read("apps", "client", "src", "debug", "PerfOverlay.ts"));
    expect(src).toMatch(/hordeStreamText\(this\.keyRate, h\.decodeErrors\)/);
  });

  it("the bots and the netsim harness use the same stream decoder (brief 20)", () => {
    expect(code(read("tools", "bots", "botClient.ts"))).toMatch(/this\.hordeStream\.decode\(b, this\.horde\)/);
    expect(code(read("tools", "netsim", "hitsSim.ts"))).toMatch(/hordeStream\.decode\(d\.horde, hordeSink\)/);
  });

  it("no allocation in the encoder's per-tick path or the decoder's decode path", () => {
    const enc = code(read("apps", "server", "src", "net", "hordeEncoder.ts"));
    const dec = code(read("packages", "shared", "src", "net", "hordeStream.ts"));
    const alloc = /\bnew \w|\.slice\(|\.subarray\(|Array\.from|\.map\(|\.filter\(|\[\.\.\.|\{ *\.\.\./;
    for (const m of ["collect", "writeKey", "encodeFor", "writeDelta", "commitKey", "commitDelta"]) expect(method(enc, m), m).not.toMatch(alloc);
    expect(method(enc, "send").replace("this.stateFor(client)", "")).not.toMatch(alloc); // stateFor: once per client object
    for (const m of ["decode", "validKey", "validDelta", "applyKey", "put", "applyDelta", "emit"]) expect(method(dec, m), m).not.toMatch(alloc);
  });
});
