import { describe, expect, it } from "vitest";
import { hordeStreamText } from "./perfStats";

describe("Story 8.10 (AC 9): the overlay's horde stream line", () => {
  it("reads `key 1.0/s · err 0`", () => {
    expect(hordeStreamText(1, 0)).toBe("key 1.0/s · err 0");
    expect(hordeStreamText(0.95, 3)).toBe("key 0.9/s · err 3");
  });
});
