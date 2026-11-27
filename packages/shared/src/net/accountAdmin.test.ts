import { describe, expect, it } from "vitest";
import { accountSessionResponseSchema, deviceSessionResponseSchema, recoverResponseSchema } from "./account";

/** Story 10.11 (AC 2): `account.admin` is optional (an older server's reply still validates). */
describe("session replies with and without account.admin", () => {
  const base = { saved: true, deviceToken: "a1".repeat(16), ticket: "t".repeat(40), account: { displayName: "", username: "mo" } };

  it("accepts admin true / false and its absence; refuses a non-boolean", () => {
    for (const s of [accountSessionResponseSchema, deviceSessionResponseSchema]) {
      expect(s.safeParse(base).success).toBe(true);
      expect(s.safeParse({ ...base, account: { ...base.account, admin: true } }).data?.account?.admin).toBe(true);
      expect(s.safeParse({ ...base, account: { ...base.account, admin: false } }).data?.account?.admin).toBe(false);
      expect(s.safeParse({ ...base, account: { ...base.account, admin: "yes" } }).success).toBe(false);
    }
    expect(recoverResponseSchema.safeParse({ ...base, account: { ...base.account, admin: true }, recoveryCode: "ABCD-EFGH-JKMN" }).data?.account?.admin).toBe(true);
  });
});
