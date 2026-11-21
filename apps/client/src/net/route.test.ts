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

  it("reads links under the build's base path (GitHub Pages subpath)", () => {
    expect(parseJoinPath("/topdown-shooter/j/abcd", "/topdown-shooter/")).toBe("ABCD");
    expect(parseJoinPath("/j/abcd", "/topdown-shooter/")).toBeNull();
  });

  it("returns a too-long code unshortened (the caller shows Game not found)", () => {
    expect(parseJoinPath("/j/ABCDE")).toBe("ABCDE");
  });
});

