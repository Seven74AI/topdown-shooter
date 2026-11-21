import { describe, expect, it } from "vitest";
import { parseJoinPath } from "./route";

describe("parseJoinPath", () => {
  it("returns the code of a share link, uppercased", () => {
    expect(parseJoinPath("/j/ABCD")).toBe("ABCD");
    expect(parseJoinPath("/j/abcd")).toBe("ABCD");
    expect(parseJoinPath("/J/wXyZ/")).toBe("WXYZ");
  });

  it("returns null for any other path", () => {
    for (const p of ["/", "", "/j", "/j/", "/j/AB12", "/j/ABCD/x", "/x/j/ABCD", "/jABCD", "/j//ABCD", "/j/AB CD"]) {
      expect(parseJoinPath(p)).toBeNull();
    }
  });

  it("keeps a malformed code for the start screen to refuse", () => {
    expect(parseJoinPath("/j/abio")).toBe("ABIO");
  });
});
