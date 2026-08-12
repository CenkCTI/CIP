import { describe, expect, it, vi } from "vitest";
import { firstEpssAdapter } from "./providers/first-epss";
import { threatFoxHighWaterForWindow } from "./providers/threatfox";

describe("source-setting-bound incremental cursors", () => {
  const epssPayload = {
    total: 1,
    offset: 0,
    limit: 2500,
    data: [{ cve: "CVE-2099-10001", epss: "0.82", percentile: "0.99", date: "2099-01-01" }],
  };

  it("does not reuse FIRST Last-Modified when the EPSS threshold changes", async () => {
    const fetchImpl = vi.fn(async (_input: URL | RequestInfo | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("if-modified-since")).toBeNull();
      return new Response(JSON.stringify(epssPayload), {
        status: 200,
        headers: { "content-type": "application/json", "last-modified": "Fri, 02 Jan 2099 01:00:00 GMT" },
      });
    });
    const result = await firstEpssAdapter.collect({
      now: new Date("2099-01-02T02:00:00Z"),
      cursor: { version: 1, minimumEpss: 0.1, lastModified: "Thu, 01 Jan 2099 01:00:00 GMT" },
      settings: { minimumEpss: 0.2 },
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.nextCursor).toEqual({
      version: 1,
      lastModified: "Fri, 02 Jan 2099 01:00:00 GMT",
      minimumEpss: 0.2,
    });
  });

  it("refreshes the bounded FIRST page without conditional reuse during NODE-2G cutover", async () => {
    const fetchImpl = vi.fn(async (_input: URL | RequestInfo | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("if-modified-since")).toBeNull();
      return new Response(JSON.stringify(epssPayload), {
        status: 200,
        headers: { "content-type": "application/json", "last-modified": "Fri, 02 Jan 2099 01:00:00 GMT" },
      });
    });
    const result = await firstEpssAdapter.collect({
      now: new Date("2099-01-02T02:00:00Z"),
      cursor: { version: 1, minimumEpss: 0.2, lastModified: "Thu, 01 Jan 2099 01:00:00 GMT" },
      settings: { minimumEpss: 0.2 },
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.recordsMapped).toBe(1);
    expect(result.nextCursor).toEqual({
      version: 1,
      lastModified: "Fri, 02 Jan 2099 01:00:00 GMT",
      minimumEpss: 0.2,
    });
  });

  it("resets the ThreatFox high-water mark when lookback changes", () => {
    expect(threatFoxHighWaterForWindow({ version: 1, maxProviderId: "123", lookbackDays: 1 }, 1)).toBe(BigInt(123));
    expect(threatFoxHighWaterForWindow({ version: 1, maxProviderId: "123", lookbackDays: 1 }, 7)).toBe(BigInt(0));
    expect(threatFoxHighWaterForWindow({ version: 1 }, 1)).toBe(BigInt(0));
  });
});
