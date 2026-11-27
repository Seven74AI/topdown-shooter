import { describe, expect, it } from "vitest";
import { cleanReportText, cutText, reportRequestSchema } from "./report";

/** Story 10.6 review M1: no half emoji from the client, no NUL / lone surrogate stored by the server. */
const device = { userAgent: "t", screen: { w: 1, h: 1 }, viewport: { w: 1, h: 1 }, dpr: 1, safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, input: "touch", language: "en", installed: false };

describe("cutText", () => {
  it("never splits a surrogate pair at the cut; plain text is cut at max", () => {
    const s = "a".repeat(299) + "😀b"; // the emoji's high half sits at index 299
    expect(cutText(s, 300)).toBe("a".repeat(299));
    expect(cutText(s, 301)).toBe("a".repeat(299) + "😀");
    expect(cutText("abcdef", 3)).toBe("abc");
    expect(cutText("ab", 3)).toBe("ab");
    for (let n = 0; n <= 40; n++) expect(cleanReportText(cutText("😀".repeat(20), n))).toBe(cutText("😀".repeat(20), n)); // no lone half ever
  });
});

describe("cleanReportText / the request schema", () => {
  it("strips NUL and lone surrogates, keeps real pairs", () => {
    expect(cleanReportText("a\u0000b")).toBe("ab");
    expect(cleanReportText("x\uD83Dy")).toBe("xy");
    expect(cleanReportText("x\uDE00y")).toBe("xy");
    expect(cleanReportText("ok 😀")).toBe("ok 😀");
    expect(cleanReportText("\uDE00\uD83D")).toBe(""); // reversed halves are both lone
  });

  it("every string in a parsed report is cleaned (note, lines, device fields, quality values)", () => {
    const r = reportRequestSchema.parse({
      note: "it\u0000 froze \uD83D",
      payload: { lines: ["a\uDE00", "b\u0000"], roomId: "r\u0000", device: { ...device, userAgent: "UA\uD800", quality: { rain: "full\u0000" } } },
    });
    expect(r.note).toBe("it froze ");
    expect(r.payload.lines).toEqual(["a", "b"]);
    expect(r.payload.roomId).toBe("r");
    expect(r.payload.device.userAgent).toBe("UA");
    expect(r.payload.device.quality).toEqual({ rain: "full" });
  });
});
