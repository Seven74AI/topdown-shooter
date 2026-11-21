import { describe, expect, it } from "vitest";
import { MAX_HTTP_BODY_BYTES, refuseReason } from "./httpGuard";

describe("HTTP body guard", () => {
  it("lets body-less and small requests through", () => {
    expect(refuseReason("GET", undefined, false)).toBeNull();
    expect(refuseReason("POST", "120", false)).toBeNull();
    expect(refuseReason("POST", String(MAX_HTTP_BODY_BYTES), false)).toBeNull();
  });
  it("refuses large or unbounded bodies before they are read", () => {
    expect(refuseReason("POST", String(MAX_HTTP_BODY_BYTES + 1), false)).toBe(413);
    expect(refuseReason("POST", "52428800", false)).toBe(413);
    expect(refuseReason("POST", "abc", false)).toBe(413);
    expect(refuseReason("POST", undefined, true)).toBe(411);
  });
});
