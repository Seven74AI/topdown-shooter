import { describe, expect, it } from "vitest";
import { GAME_TITLE, TICK_RATE_HZ } from "./constants";

describe("constants", () => {
  it("names the game", () => {
    expect(GAME_TITLE).toBe("topdown-shooter");
  });

  it("ticks the simulation at 20 Hz", () => {
    expect(TICK_RATE_HZ).toBe(20);
  });
});
