import { describe, expect, it } from "vitest";
import { accountLine, formState, inRoom, saveHints, showNudge } from "./accountModel";
import { openAccount, type UiScreen } from "./uiState";

/** Story 7.6 (AC 3, 9, 10): the account screens' rules. */
const results = (online: boolean): UiScreen => ({ kind: "results", wave: 10, rows: [], online, ending: "extracted", endless: false, seed: 1, dawnEndsAtMs: 0 });

describe("accountModel (Story 7.6)", () => {
  it("Save turns on only for the server's rules (3–20 of A-Z a-z 0-9 _ - ., password 8–128) and hints what's wrong", () => {
    expect(formState("save", { username: "mo_42", password: "12345678", code: "" }).canSubmit).toBe(true);
    expect(formState("save", { username: "mo", password: "12345678", code: "" }).canSubmit).toBe(false);
    expect(formState("save", { username: "mo 42", password: "12345678", code: "" }).canSubmit).toBe(false);
    expect(formState("save", { username: "mo_42", password: "1234567", code: "" }).canSubmit).toBe(false);
    expect(formState("save", { username: "mo_42", password: "x".repeat(129), code: "" }).canSubmit).toBe(false);
    expect(saveHints({ username: "mo!", password: "short", code: "" })).toEqual({ username: "Use 3–20 letters, numbers, _ - .", password: "Use 8–128 characters" });
    expect(saveHints({ username: "", password: "", code: "" })).toEqual({ username: null, password: null });
  });

  it("Log in only needs something typed (the answer never says which part was wrong)", () => {
    expect(formState("login", { username: "x", password: "y", code: "" }).canSubmit).toBe(true);
    expect(formState("login", { username: " ", password: "y", code: "" }).canSubmit).toBe(false);
  });

  it("AC1: Next stays off until the recovery code is complete (case-insensitive, dashes optional), with the letters-to-go hint", () => {
    const f = (code: string) => formState("forgot", { username: "mo_42", password: "new pass 1", code });
    expect(f("abcd-efgh-jk")).toEqual({ canSubmit: false, codeHint: "2 letters to go: Next turns on when the code is complete." });
    expect(f("ABCDEFGHJKM").codeHint).toBe("1 letter to go: Next turns on when the code is complete.");
    expect(f("abcd efgh jkmn")).toEqual({ canSubmit: true, codeHint: null });
    expect(f("ABCD-EFGH-JKMU").canSubmit).toBe(false); // U is not in the alphabet
    expect(f("ABCD-EFGH-JKMNP").codeHint).toBe("That isn't a recovery code: check your screenshot.");
    expect(formState("forgot", { username: "mo_42", password: "short", code: "ABCD-EFGH-JKMN" }).canSubmit).toBe(false);
  });

  it("AC 9: in a room (lobby, online Results or run, the hub opened from the lobby) a switch is refused; start, solo Results and the start hub allow it", () => {
    expect(inRoom({ kind: "start" })).toBe(false);
    expect(inRoom({ kind: "lobby", code: "ABCD" })).toBe(true);
    expect(inRoom({ kind: "progress", back: { kind: "lobby", code: "ABCD" } })).toBe(true);
    expect(inRoom({ kind: "progress", back: { kind: "start" } })).toBe(false);
    expect(inRoom(results(true))).toBe(true);
    expect(inRoom(results(false))).toBe(false);
    expect(inRoom({ kind: "account", view: "login", back: { kind: "lobby", code: "ABCD" } })).toBe(true);
  });

  it("openAccount keeps the first screen as Back (forgot from login returns to the start screen, not the login form)", () => {
    const login = openAccount("login", { kind: "start", error: "x" });
    expect(login).toEqual({ kind: "account", view: "login", back: { kind: "start" } });
    expect(openAccount("forgot", login)).toEqual({ kind: "account", view: "forgot", back: { kind: "start" } });
    expect(openAccount("code", login, "ABCD-EFGH-JKMN")).toEqual({ kind: "account", view: "code", back: { kind: "start" }, code: "ABCD-EFGH-JKMN" });
  });

  it("the account line waits for the server; guest vs logged in", () => {
    expect(accountLine({ known: false, username: null })).toEqual({ kind: "unknown" });
    expect(accountLine({ known: true, username: null })).toEqual({ kind: "guest" });
    expect(accountLine({ known: true, username: "mo_42" })).toEqual({ kind: "user", username: "mo_42" });
  });

  it("AC 10: the nudge shows for a saved bank with nudge: true and a guest only", () => {
    const guest = { known: true, username: null };
    expect(showNudge({ nudge: true, status: "saved" }, guest)).toBe(true);
    expect(showNudge({ nudge: false, status: "saved" }, guest)).toBe(false);
    expect(showNudge({ status: "saved" }, guest)).toBe(false);
    expect(showNudge({ nudge: true, status: "failed" }, guest)).toBe(false);
    expect(showNudge({ nudge: true, status: "saved" }, { known: true, username: "mo_42" })).toBe(false); // saved meanwhile
    expect(showNudge(null, guest)).toBe(false);
  });
});
