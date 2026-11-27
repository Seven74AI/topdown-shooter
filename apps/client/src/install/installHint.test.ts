import { describe, expect, it } from "vitest";
import { INSTALL_TEXT, installPlatform, isIos, showInstallHint, type InstallEnv } from "./installHint";

/** Story 10.5 (Q3 = C): who gets the install hint, and only once. */
const env = (o: Partial<InstallEnv>): InstallEnv => ({ installed: false, touch: true, ios: false, canPrompt: false, ...o });

describe("Story 10.5: the install hint", () => {
  it("Android with the browser's prompt gets the Install button; iOS gets the Share text; nobody else gets anything", () => {
    expect(installPlatform(env({ canPrompt: true }))).toBe("android");
    expect(installPlatform(env({ ios: true }))).toBe("ios");
    expect(installPlatform(env({}))).toBeNull(); // e.g. Firefox Android: no prompt, no iOS
    expect(installPlatform(env({ touch: false, canPrompt: true }))).toBeNull(); // desktop Chrome: the omnibox icon is enough
    expect(installPlatform(env({ installed: true, canPrompt: true }))).toBeNull();
    expect(installPlatform(env({ installed: true, ios: true }))).toBeNull();
  });

  it("at most once ever: a stored 'shown' keeps it off", () => {
    expect(showInstallHint("android", null)).toBe(true);
    expect(showInstallHint("ios", null)).toBe(true);
    expect(showInstallHint("ios", "shown")).toBe(false);
    expect(showInstallHint(null, null)).toBe(false);
  });

  it("iOS detection, iPadOS included", () => {
    expect(isIos("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5)).toBe(true); // iPadOS
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0)).toBe(false); // a Mac
    expect(isIos("Mozilla/5.0 (Linux; Android 14; Pixel 7)", "Linux armv81", 5)).toBe(false);
  });

  it("the texts name the game and, on iOS, the exact Share path", () => {
    expect(INSTALL_TEXT.ios).toContain("Share → Add to Home Screen");
    expect(INSTALL_TEXT.android).toContain("Hordes");
  });
});
