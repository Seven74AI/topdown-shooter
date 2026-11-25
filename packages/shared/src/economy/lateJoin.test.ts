import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { lateJoinWallet } from "./lateJoin";

/** Story 8.2 J1 "Late is welcome, not rich" (decisions E8-J1, E8-J2): the AC 2 table. */
const balance = loadBalance();
const seats = (...earned: number[]) => earned.map((e) => ({ earned: e }));

describe("lateJoinWallet (Story 8.2 AC 2, J1)", () => {
  it("reads economy.json › lateJoin", () => {
    expect(balance.economy.lateJoin).toEqual({ base: 100, avgShare: 0.6, extraBuildS: 15 });
    expect(balance.economy.startingWallet).toBe(200);
  });

  it("the AC 2 table: avg 0 → 200, 900 → 640, 2,170 → 1,402, 200 → 220", () => {
    expect(lateJoinWallet(seats(0, 0), balance, 200)).toBe(200); // first build: never less than a normal start
    expect(lateJoinWallet(seats(900), balance, 200)).toBe(640);
    expect(lateJoinWallet(seats(2000, 2340), balance, 200)).toBe(1402); // avg 2,170 (≈ wave 9)
    expect(lateJoinWallet(seats(200), balance, 200)).toBe(220);
  });

  it("no seat in the fight → the own start money", () => {
    expect(lateJoinWallet([], balance, 200)).toBe(200);
  });

  it("Training start money raises only the floor, never adds on top (E8-J1)", () => {
    expect(lateJoinWallet(seats(0), balance, 250)).toBe(250);
    expect(lateJoinWallet(seats(900), balance, 250)).toBe(640);
  });

  it("rounds the share down", () => {
    expect(lateJoinWallet(seats(1), balance, 0)).toBe(100); // 0.6 → 0
    expect(lateJoinWallet(seats(2, 3), balance, 0)).toBe(101); // avg 2.5 × 0.6 = 1.5 → 1
  });

  it("still behind the team at wave 9 (late is not rich)", () => {
    const team = seats(2100, 2240);
    expect(lateJoinWallet(team, balance, 200)).toBeLessThan(2100);
  });
});
