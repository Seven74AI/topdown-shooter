import { describe, expect, it } from "vitest";
import { GUEST_TOKEN_KEY, guestTokenSource, newGuestToken, type TokenStorage } from "./guestToken";

const TOKEN_RE = /^[0-9a-f]{32}$/;

function memoryStorage(initial: Record<string, string> = {}): TokenStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const throwing: TokenStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
};

describe("guest token", () => {
  it("is 32 lowercase hex digits from 16 random bytes", () => {
    expect(newGuestToken()).toMatch(TOKEN_RE);
    expect(newGuestToken()).not.toBe(newGuestToken());
    expect(newGuestToken((b) => b.fill(0xab))).toBe("ab".repeat(16));
    expect(newGuestToken((b) => b.fill(1))).toBe("01".repeat(16));
  });

  it("creates and stores a token on first use, then reuses it", () => {
    const storage = memoryStorage();
    const token = guestTokenSource(() => storage)();
    expect(token).toMatch(TOKEN_RE);
    expect(storage.data[GUEST_TOKEN_KEY]).toBe(token);
    // A later page load reads the same token.
    expect(guestTokenSource(() => storage)()).toBe(token);
  });

  it("reuses a valid stored token", () => {
    const stored = "0123456789abcdef0123456789abcdef";
    const storage = memoryStorage({ [GUEST_TOKEN_KEY]: stored });
    expect(guestTokenSource(() => storage)()).toBe(stored);
  });

  it("regenerates an invalid stored value", () => {
    for (const bad of ["", "nope", "0123456789ABCDEF0123456789ABCDEF", "0".repeat(31)]) {
      const storage = memoryStorage({ [GUEST_TOKEN_KEY]: bad });
      const token = guestTokenSource(() => storage)();
      expect(token).toMatch(TOKEN_RE);
      expect(token).not.toBe(bad);
      expect(storage.data[GUEST_TOKEN_KEY]).toBe(token);
    }
  });

  it("keeps an in-memory token for the page when storage throws", () => {
    const get = guestTokenSource(() => throwing);
    const token = get();
    expect(token).toMatch(TOKEN_RE);
    expect(get()).toBe(token);
    // Accessing localStorage itself can throw too.
    const get2 = guestTokenSource(() => {
      throw new Error("blocked");
    });
    expect(get2()).toMatch(TOKEN_RE);
    expect(get2()).toBe(get2());
  });

  it("keeps an in-memory token when only writing fails (quota)", () => {
    const storage: TokenStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const get = guestTokenSource(() => storage);
    expect(get()).toBe(get());
  });
});
