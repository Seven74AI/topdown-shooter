import { describe, expect, it } from "vitest";
import { REPORT_MAX_BYTES } from "@topdown/shared";
import { MAX_HTTP_BODY_BYTES, maxBodyBytes, refuseReason } from "./httpGuard";

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

describe("Story 10.6 (B2): the one 64 KB path", () => {
  it("/account/report accepts up to 64 KB by its header; over is 413; a query string doesn't change it", () => {
    expect(maxBodyBytes("/account/report")).toBe(REPORT_MAX_BYTES);
    expect(refuseReason("POST", String(REPORT_MAX_BYTES), false, "/account/report")).toBeNull();
    expect(refuseReason("POST", "3000", false, "/account/report?x=1")).toBeNull();
    expect(refuseReason("POST", String(REPORT_MAX_BYTES + 1), false, "/account/report")).toBe(413);
    expect(refuseReason("POST", undefined, true, "/account/report")).toBe(411);
  });

  it("every other path keeps the 2 KB cap (a 3 KB body is refused), including look-alike paths", () => {
    for (const url of [undefined, "/account/settings", "/matchmake/create/run", "/account/report/x", "/account/reports", "/api/account/report", "/x/account/report"]) {
      expect(maxBodyBytes(url), String(url)).toBe(MAX_HTTP_BODY_BYTES);
      expect(refuseReason("POST", "3000", false, url), String(url)).toBe(413);
    }
  });
});
