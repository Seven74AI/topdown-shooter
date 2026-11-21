import { describe, expect, it } from "vitest";
import { originAllowed, parseAllowedOrigins } from "./origin";

const GAME = parseAllowedOrigins("https://hordes.sevend.io");

describe("originAllowed", () => {
  it("allows the exact origin", () => {
    expect(originAllowed("https://hordes.sevend.io", GAME)).toBe(true);
  });

  it("treats a trailing slash as the same origin", () => {
    expect(originAllowed("https://hordes.sevend.io/", GAME)).toBe(true);
    expect(originAllowed("https://hordes.sevend.io", parseAllowedOrigins("https://hordes.sevend.io/"))).toBe(true);
  });

  it("refuses another scheme", () => {
    expect(originAllowed("http://hordes.sevend.io", GAME)).toBe(false);
  });

  it("refuses another port", () => {
    expect(originAllowed("https://hordes.sevend.io:8443", GAME)).toBe(false);
    // The default port is the same origin.
    expect(originAllowed("https://hordes.sevend.io:443", GAME)).toBe(true);
  });

  it("refuses a missing, null or malformed origin", () => {
    expect(originAllowed(null, GAME)).toBe(false);
    expect(originAllowed(undefined, GAME)).toBe(false);
    expect(originAllowed("", GAME)).toBe(false);
    expect(originAllowed("null", GAME)).toBe(false);
    expect(originAllowed("not a url", GAME)).toBe(false);
  });

  it("ignores case in the host", () => {
    expect(originAllowed("https://Hordes.SEVEND.io", GAME)).toBe(true);
  });

  it("refuses other hosts, including look-alikes", () => {
    expect(originAllowed("https://evil.example", GAME)).toBe(false);
    expect(originAllowed("https://hordes.sevend.io.evil.example", GAME)).toBe(false);
    expect(originAllowed("https://x.hordes.sevend.io", GAME)).toBe(false);
  });

  it("allows everything when the list is empty (dev)", () => {
    expect(originAllowed(null, [])).toBe(true);
    expect(originAllowed("http://localhost:5173", [])).toBe(true);
  });
});

describe("parseAllowedOrigins", () => {
  it("splits a comma-separated list and trims it", () => {
    expect(parseAllowedOrigins(" https://hordes.sevend.io , http://localhost:5173 ")).toEqual([
      "https://hordes.sevend.io",
      "http://localhost:5173",
    ]);
  });

  it("is empty when unset or blank", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins("  ")).toEqual([]);
  });

  it("throws on an entry that is not an origin, so a typo can't disable the check", () => {
    expect(() => parseAllowedOrigins("hordes.sevend.io")).toThrow(/PUBLIC_ORIGIN/);
  });
});
