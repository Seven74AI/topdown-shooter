import { describe, expect, it } from "vitest";
import { ipKey, roomCreateLimiter, SlidingWindowLimiter } from "./rateLimit";

function limiter(limit = 3, windowMs = 1000) {
  let now = 0;
  const l = new SlidingWindowLimiter(limit, windowMs, () => now);
  return { l, advance: (ms: number) => (now += ms) };
}

describe("SlidingWindowLimiter", () => {
  it("allows up to the limit in the window, then refuses", () => {
    const { l } = limiter();
    expect([l.allow("a"), l.allow("a"), l.allow("a"), l.allow("a")]).toEqual([true, true, true, false]);
  });

  it("counts each key on its own", () => {
    const { l } = limiter(1);
    expect(l.allow("a")).toBe(true);
    expect(l.allow("a")).toBe(false);
    expect(l.allow("b")).toBe(true);
  });

  it("slides: an entry frees up exactly one window after it was made", () => {
    const { l, advance } = limiter(2, 1000);
    l.allow("a"); // t=0
    advance(500);
    l.allow("a"); // t=500
    expect(l.allow("a")).toBe(false);
    advance(499); // t=999: the t=0 entry is still inside
    expect(l.allow("a")).toBe(false);
    advance(1); // t=1000: the t=0 entry is out
    expect(l.allow("a")).toBe(true);
    expect(l.allow("a")).toBe(false);
  });

  it("does not count refused attempts", () => {
    const { l, advance } = limiter(1, 1000);
    l.allow("a");
    advance(900);
    expect(l.allow("a")).toBe(false);
    advance(100);
    expect(l.allow("a")).toBe(true);
  });

  it("prunes keys whose entries all expired", () => {
    const { l, advance } = limiter(1, 1000);
    l.allow("a");
    l.allow("b");
    expect(l.size).toBe(2);
    advance(1000);
    l.allow("c");
    expect(l.size).toBe(1);
  });

  it("reset forgets everything", () => {
    const { l } = limiter(1);
    l.allow("a");
    l.reset();
    expect(l.allow("a")).toBe(true);
  });

  it("counts keys through keyOf", () => {
    const l = new SlidingWindowLimiter(1, 1000, () => 0, (k) => k.toLowerCase());
    expect(l.allow("A")).toBe(true);
    expect(l.allow("a")).toBe(false);
  });
});

describe("ipKey", () => {
  it("keeps IPv4 and non-IP values as they are", () => {
    expect(ipKey("1.2.3.4")).toBe("1.2.3.4");
    expect(ipKey("unknown")).toBe("unknown");
    expect(ipKey("not an ip")).toBe("not an ip");
    expect(ipKey("")).toBe("");
  });

  it("keys IPv6 by its /64 prefix", () => {
    expect(ipKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
    expect(ipKey("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    expect(ipKey("2001:0DB8:0001:0002:0000:0000:0000:0001")).toBe("2001:db8:1:2::/64");
    expect(ipKey("2001:db8:1:3::1")).toBe("2001:db8:1:3::/64");
    expect(ipKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipKey("::1")).toBe("0:0:0:0::/64");
  });

  it("strips brackets and a zone id", () => {
    expect(ipKey("[2001:db8:1:2::1]")).toBe("2001:db8:1:2::/64");
    expect(ipKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("keys IPv4-mapped IPv6 by the IPv4", () => {
    expect(ipKey("::ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(ipKey("::FFFF:10.0.0.255")).toBe("10.0.0.255");
    expect(ipKey("::ffff:0102:0304")).toBe("1.2.3.4");
    expect(ipKey("0:0:0:0:0:ffff:1.2.3.4")).toBe("1.2.3.4");
  });
});

describe("roomCreateLimiter", () => {
  it("counts every address of one IPv6 /64 together, and a mapped IPv4 with its IPv4", () => {
    roomCreateLimiter.reset();
    try {
      for (let i = 1; i <= 10; i++) expect(roomCreateLimiter.allow(`2001:db8:1:2::${i}`)).toBe(true);
      expect(roomCreateLimiter.allow("2001:db8:1:2:ffff::9")).toBe(false);
      expect(roomCreateLimiter.allow("2001:db8:1:3::1")).toBe(true);

      for (let i = 0; i < 10; i++) expect(roomCreateLimiter.allow("1.2.3.4")).toBe(true);
      expect(roomCreateLimiter.allow("::ffff:1.2.3.4")).toBe(false);
    } finally {
      roomCreateLimiter.reset();
    }
  });
});
