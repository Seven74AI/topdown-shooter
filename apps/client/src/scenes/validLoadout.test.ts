import { describe, expect, it } from "vitest";
import { validLoadout } from "./validLoadout";

describe("validLoadout", () => {
  const known = ["pistol", "smg", "hunting_rifle", "machete"];
  it("keeps known ids and drops unknown ones", () => {
    expect(validLoadout(["pistol", "machete"], known)).toEqual(["pistol", "machete"]);
    expect(validLoadout(["pistol", "laser"], known)).toEqual(["pistol", null]);
    expect(validLoadout(["laser", "smg"], known)).toEqual(["smg", null]);
    expect(validLoadout(["laser", null], known)).toBeNull();
  });
});
