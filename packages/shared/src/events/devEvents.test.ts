import { describe, expect, it } from "vitest";
import { parseDevEvents } from "./devEvents";

describe("Story 6.8: DEV_EVENTS / ?events=", () => {
  it("parses kind@wave pairs; drops junk; empty → null", () => {
    expect(parseDevEvents("car_alarm@3,stampede@4")).toEqual([
      { kind: "car_alarm", wave: 3 },
      { kind: "stampede", wave: 4 },
    ]);
    expect(parseDevEvents(" stampede@1 , pizza@2, car_alarm@x, car_alarm@0")).toEqual([{ kind: "stampede", wave: 1 }]);
    expect(parseDevEvents("")).toBeNull();
    expect(parseDevEvents(undefined)).toBeNull();
    expect(parseDevEvents("nope@1")).toBeNull();
  });
});
