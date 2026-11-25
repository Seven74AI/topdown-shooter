/** Story 8.8 (AC 2): the bots' lossy-line flags. */
import { describe, expect, it } from "vitest";
import { isLocalUrl, lineUrl, parseLine } from "./lineArgs";

const flags = (o: Record<string, string>) => (name: string) => o[name];
const LOCAL = "http://localhost:2681";

describe("bots --lag/--jitter/--loss/--stall (Story 8.8)", () => {
  it("off without --lag/--jitter/--loss; --stall alone turns nothing on", () => {
    expect(parseLine(flags({}), LOCAL)).toBeNull();
    expect(parseLine(flags({ stall: "400" }), LOCAL)).toBeNull();
    expect(parseLine(flags({}), "https://hordes.sevend.io/api")).toBeNull(); // no line: a remote url is fine
  });

  it("reads the lossy line (default stall 200 ms)", () => {
    expect(parseLine(flags({ lag: "150", jitter: "20", loss: "1" }), LOCAL)).toEqual({ rttMs: 150, jitterMs: 20, lossPct: 1, stallMs: 200 });
    expect(parseLine(flags({ loss: "0.5", stall: "400" }), "http://127.0.0.1:2681")).toEqual({ rttMs: 0, jitterMs: 0, lossPct: 0.5, stallMs: 400 });
  });

  it("refuses a remote --url with a clear message, and out-of-range values", () => {
    expect(() => parseLine(flags({ lag: "150" }), "https://hordes.sevend.io/api")).toThrow(/local --url/);
    expect(() => parseLine(flags({ loss: "21" }), LOCAL)).toThrow(/--loss must be 0–20/);
    expect(() => parseLine(flags({ loss: "1", stall: "2000" }), LOCAL)).toThrow(/--stall must be 0–1000/);
    expect(() => parseLine(flags({ lag: "x" }), LOCAL)).toThrow(/--lag/);
    expect(isLocalUrl("http://[::1]:2681")).toBe(true);
    expect(isLocalUrl("http://localhost.evil.com:2681")).toBe(false);
    expect(isLocalUrl("not a url")).toBe(false);
  });

  it("review N2: the caps are the client's; the bots' URL keeps its scheme, host name and path", () => {
    expect(() => parseLine(flags({ jitter: "1001" }), LOCAL)).toThrow(/--jitter must be 0–1000/);
    expect(parseLine(flags({ lag: "2000" }), LOCAL)?.rttMs).toBe(2000);
    expect(lineUrl("https://localhost:2681/api", 40123)).toBe("https://localhost:40123/api");
    expect(lineUrl("http://127.0.0.1:2681", 40123)).toBe("http://127.0.0.1:40123");
    expect(lineUrl("http://[::1]:2681", 40123)).toBe("http://127.0.0.1:40123");
  });
});
