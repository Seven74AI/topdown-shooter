import { describe, expect, it } from "vitest";
import { share, shareLink } from "./share";

describe("shareLink", () => {
  it("builds the /j/<code> link on the page origin", () => {
    expect(shareLink("ABCD", "https://play.example", "/")).toBe("https://play.example/j/ABCD");
    expect(shareLink("ABCD", "https://x.github.io", "/topdown-shooter/")).toBe("https://x.github.io/topdown-shooter/j/ABCD");
  });
});

describe("share", () => {
  it("uses the Web Share API when present", async () => {
    const shared: ShareData[] = [];
    const result = await share("ABCD", "https://x.test", {
      share: async (d: ShareData) => void shared.push(d),
      clipboard: { writeText: async () => {} },
    });
    expect(result).toBe("shared");
    expect(shared[0]?.url).toBe("https://x.test/j/ABCD");
  });

  it("falls back to copying the link", async () => {
    const copied: string[] = [];
    const result = await share("ABCD", "https://x.test", {
      clipboard: { writeText: async (t: string) => void copied.push(t) },
    });
    expect(result).toBe("copied");
    expect(copied).toEqual(["https://x.test/j/ABCD"]);
  });

  it("reports a cancelled share and a blocked clipboard", async () => {
    const abort = Object.assign(new Error("cancel"), { name: "AbortError" });
    expect(
      await share("ABCD", "https://x.test", {
        share: async () => Promise.reject(abort),
        clipboard: { writeText: async () => {} },
      }),
    ).toBe("cancelled");
    expect(
      await share("ABCD", "https://x.test", { clipboard: { writeText: async () => Promise.reject(new Error("no")) } }),
    ).toBe("failed");
    expect(await share("ABCD", "https://x.test", {})).toBe("failed");
  });
});
