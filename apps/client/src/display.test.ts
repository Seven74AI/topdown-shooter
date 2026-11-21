import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_DPR, dpr } from "./display";

const withDevicePixelRatio = (value: number) => vi.stubGlobal("window", { devicePixelRatio: value });

describe("dpr", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caps at 2", () => {
    expect(MAX_DPR).toBe(2);
  });

  it.each([
    [1, 1],
    [1.5, 1.5],
    [2, 2],
    [3, 2],
    [4, 2],
  ])("devicePixelRatio %d renders at %d", (device, expected) => {
    withDevicePixelRatio(device);
    expect(dpr()).toBe(expected);
  });

  it("falls back to 1 when devicePixelRatio is missing", () => {
    withDevicePixelRatio(0);
    expect(dpr()).toBe(1);
  });
});
