import { describe, expect, it } from "vitest";
import { validLoadout } from "./validLoadout";

describe("validLoadout", () => {
  const known = ["pistol", "smg", "hunting_rifle", "machete"];
  const w = (ids: readonly [string, string | null]) => validLoadout(ids, known, 4)?.weapons ?? null;
  it("keeps known ids and drops unknown ones", () => {
    expect(w(["pistol", "machete"])).toEqual(["pistol", "machete"]);
    expect(w(["pistol", "laser"])).toEqual(["pistol", null]);
    expect(w(["laser", "smg"])).toEqual(["smg", null]);
    expect(validLoadout(["laser", null], known, 4)).toBeNull();
  });

  it("Story 5.1: id:level parsing (smg:3 → 3; smg:9 → 1; smg:x → 1; no level → 1)", () => {
    expect(validLoadout(["smg:3", "machete:2"], known, 4)).toEqual({ weapons: ["smg", "machete"], levels: [3, 2] });
    expect(validLoadout(["smg:9", null], known, 4)).toEqual({ weapons: ["smg", null], levels: [1, 1] });
    expect(validLoadout(["smg:x", "machete:0"], known, 4)).toEqual({ weapons: ["smg", "machete"], levels: [1, 1] });
    expect(validLoadout(["smg", "machete:4"], known, 4)).toEqual({ weapons: ["smg", "machete"], levels: [1, 4] });
    expect(validLoadout(["laser:3", "smg:2"], known, 4)).toEqual({ weapons: ["smg", null], levels: [2, 1] });
    expect(validLoadout(["smg:2", "smg:3"], known, 4)).toEqual({ weapons: ["smg", null], levels: [2, 1] });
  });
});
