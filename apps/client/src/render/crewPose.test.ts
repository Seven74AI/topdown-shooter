import { describe, expect, it } from "vitest";
import { CREW_CLIMB_S, CREW_DOOR_M, CREW_PULL_S, CREW_STAND_M, createCrewPose, crewPose } from "./crewPose";

/** Story 12.3 (AC 8): the crew member's pose. */
describe("crewPose", () => {
  it("hidden until it can step out; steps from the door to its spot over 0.5 s", () => {
    const p = createCrewPose();
    expect(crewPose(-1, -1, -1, p).visible).toBe(false);
    crewPose(0.05, -1, -1, p);
    expect(p.visible).toBe(true);
    expect(p.dy).toBeLessThan(CREW_STAND_M.y);
    crewPose(1, -1, -1, p);
    expect(p.dx).toBeCloseTo(CREW_STAND_M.x, 6);
    expect(p.dy).toBeCloseTo(CREW_STAND_M.y, 6);
    expect(p.alpha).toBe(1);
  });

  it("pulls in after a boarding, waves the others in otherwise", () => {
    const p = createCrewPose();
    crewPose(1, -1, 0.3, p);
    expect(p.pulling).toBe(true);
    crewPose(2, -1, CREW_PULL_S + 0.1, p);
    expect(p.pulling).toBe(false);
    const a = crewPose(2, -1, -1, p).armRad;
    const b = crewPose(2.2, -1, -1, p).armRad;
    expect(a).not.toBeCloseTo(b, 2); // the wave moves
  });

  it("climbs back aboard once everyone is in, gone before the lift-off beat (0.5 s) ends", () => {
    const p = createCrewPose();
    crewPose(5, CREW_CLIMB_S / 2, -1, p);
    expect(p.visible).toBe(true);
    expect(p.alpha).toBeLessThan(1);
    expect(p.dy).toBeLessThan(CREW_STAND_M.y);
    expect(p.dy).toBeGreaterThan(CREW_DOOR_M.y);
    expect(crewPose(5, CREW_CLIMB_S, -1, p).visible).toBe(false);
    expect(CREW_CLIMB_S).toBeLessThan(0.5);
  });

  it("everyone already aboard when it would step out (a late phone): never shown", () => {
    const p = createCrewPose();
    expect(crewPose(3, 2, -1, p).visible).toBe(false);
  });
});
