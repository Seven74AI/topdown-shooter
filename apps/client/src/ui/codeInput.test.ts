import { describe, expect, it } from "vitest";
import { filterCodeInput } from "./codeInput";

describe("filterCodeInput", () => {
  it("uppercases and keeps only alphabet letters, at most 4", () => {
    expect(filterCodeInput("abcd")).toBe("ABCD");
    expect(filterCodeInput("ab")).toBe("AB");
    expect(filterCodeInput("a b-c1d")).toBe("ABCD");
    expect(filterCodeInput("abcdef")).toBe("ABCD");
    expect(filterCodeInput("oi01")).toBe(""); // not in the alphabet
    expect(filterCodeInput("zoë!")).toBe("Z");
    expect(filterCodeInput("")).toBe("");
  });
});
