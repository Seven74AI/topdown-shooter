/**
 * Story 7.6 (AC 3, 9; layout AC1, Lumen LF5): what the account screens show, as data the Preact screen renders and
 * the tests read. The SERVER decides every outcome; this only says which button is on and which text to show.
 *
 * AC1 (docs/art/epic-7/lumen/accounts.jpg): one thin account line top right of the start screen and the hub header
 * ("Guest · Save my progress · Log in" / "Logged in as mo_42 · Log out"); the forms are full screen with the main
 * button in the header (Back · title · Save / Log in / Next) so it never hides under the phone keyboard, the fields
 * scroll in the strip under it, errors are red (allowed in menus), Next stays off until the recovery code is complete.
 */
import { PASSWORD_MAX, PASSWORD_MIN, RECOVERY_CODE_LENGTH, USERNAME_RE, isCompleteRecoveryCode, normaliseRecoveryCode } from "@topdown/shared";
import type { AccountView, UiScreen } from "./uiState";

export const ACCOUNT_TEXT = {
  guest: "Guest",
  save: "Save my progress",
  logIn: "Log in",
  logOut: "Log out",
  loggedInAs: "Logged in as",
  forgot: "Forgot password?",
  back: "Back",
  username: "Username",
  usernameHint: "3–20 letters, numbers, _ - .",
  password: "Password",
  passwordHint: `${PASSWORD_MIN} or more`,
  newPassword: "New password",
  code: "Recovery code (from your screenshot)",
  next: "Next",
  saveBtn: "Save",
  working: "…",
  codeTitle: "Recovery code · keep it",
  codeLine: "Screenshot this: it's the only way back in if you forget your password",
  copy: "Copy",
  copied: "Copied",
  savedIt: "I saved it",
  logOutTitle: "Log out?",
  logOutLine: "This phone will play as a new guest. Your account is safe.",
  cancel: "Cancel",
  leaveFirst: "Leave the game first",
  noCodeNote: "No recovery code? Without it a forgotten password can't be reset (there is no email).",
  nudgeLine: "Keep these Supplies on any phone:",
} as const;

/** The header title of each view. */
export const VIEW_TITLE: Record<AccountView, string> = {
  save: "Save my progress",
  login: "Log in",
  forgot: "Forgot password",
  code: ACCOUNT_TEXT.codeTitle,
  logout: ACCOUNT_TEXT.logOutTitle,
};

/** The header's main button label of each form. */
export const VIEW_ACTION: Record<"save" | "login" | "forgot", string> = { save: ACCOUNT_TEXT.saveBtn, login: ACCOUNT_TEXT.logIn, forgot: ACCOUNT_TEXT.next };

export interface AccountFields {
  username: string;
  password: string;
  code: string;
}

export const EMPTY_FIELDS: AccountFields = { username: "", password: "", code: "" };

const passwordOk = (p: string) => p.length >= PASSWORD_MIN && p.length <= PASSWORD_MAX;

/**
 * Can the form be sent, and the hint under the field that blocks it (null = none). Save checks the server's own
 * rules (so a refusal is rare); Log in only needs something typed (the answer never says which part was wrong).
 */
export function formState(view: "save" | "login" | "forgot", f: AccountFields): { canSubmit: boolean; codeHint: string | null } {
  if (view === "save") return { canSubmit: USERNAME_RE.test(f.username) && passwordOk(f.password), codeHint: null };
  if (view === "login") return { canSubmit: f.username.trim() !== "" && f.password !== "", codeHint: null };
  const left = RECOVERY_CODE_LENGTH - normaliseRecoveryCode(f.code).length;
  const complete = isCompleteRecoveryCode(f.code);
  const codeHint = complete ? null : left > 0 ? `${left} letter${left === 1 ? "" : "s"} to go: Next turns on when the code is complete.` : "That isn't a recovery code: check your screenshot.";
  return { canSubmit: f.username.trim() !== "" && complete && passwordOk(f.password), codeHint };
}

/** The live field hint under Save's inputs (null when fine or empty). */
export function saveHints(f: AccountFields): { username: string | null; password: string | null } {
  return {
    username: f.username !== "" && !USERNAME_RE.test(f.username) ? `Use ${ACCOUNT_TEXT.usernameHint}` : null,
    password: f.password !== "" && !passwordOk(f.password) ? `Use ${PASSWORD_MIN}–${PASSWORD_MAX} characters` : null,
  };
}

/**
 * AC 9: a login, a reset or a log-out changes which account this phone is, so it is refused while the phone is in a
 * room (a lobby, a run, its Results, or the hub opened from the lobby): "Leave the game first". Save is always allowed.
 */
export function inRoom(back: UiScreen): boolean {
  switch (back.kind) {
    case "start":
      return false;
    case "progress":
      return back.back.kind === "lobby";
    case "account":
      return inRoom(back.back);
    case "results":
      return back.online;
    case "playing":
      return back.online;
    case "lobby":
      return true;
  }
}

/** The account line (start screen, hub header): what to show, or nothing until the server answered. */
export type AccountLine = { kind: "unknown" } | { kind: "guest" } | { kind: "user"; username: string };

export function accountLine(s: { known: boolean; username: string | null }): AccountLine {
  if (!s.known) return { kind: "unknown" };
  return s.username === null ? { kind: "guest" } : { kind: "user", username: s.username };
}

/** AC 10 (D9, brief 26 group 4): the Results nudge shows for this phone's own rewards with `nudge: true` and a guest. */
export function showNudge(rewards: { nudge?: boolean | undefined; status: string } | null, account: { known: boolean; username: string | null }): boolean {
  return rewards !== null && rewards.nudge === true && rewards.status === "saved" && account.username === null;
}
