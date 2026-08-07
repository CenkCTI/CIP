import { afterEach, describe, expect, it, vi } from "vitest";
import { nvdCveAdapter } from "./providers/nvd-cve";

const originalNvdKey = process.env.NVD_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalNvdKey === undefined) delete process.env.NVD_API_KEY;
  else process.env.NVD_API_KEY = originalNvdKey;
});

describe("Phase 2.3C live acceptance repairs", () => {
  it("requests the NVD optimized 2,000-record page size", async () => {
    delete process.env.NVD_API_KEY;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("resultsPerPage")).toBe("2000");
      expect(url.searchParams.get("startIndex")).toBe("0");
      return new Response(JSON.stringify({
        resultsPerPage: 2000,
        startIndex: 0,
        totalResults: 0,
        vulnerabilities: [],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const result = await nvdCveAdapter.collect({
      now: new Date("2099-01-02T00:00:00.000Z"),
      cursor: { version: 1 },
      settings: { initialLookbackHours: 24 },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.recordsSeen).toBe(0);
  });

  it("fails closed before a second request when an NVD window exceeds the 2,000-record run bound", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      resultsPerPage: 2000,
      startIndex: 0,
      totalResults: 2001,
      vulnerabilities: [],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;

    await expect(nvdCveAdapter.collect({
      now: new Date("2099-01-02T00:00:00.000Z"),
      cursor: { version: 1 },
      settings: { initialLookbackHours: 24 },
      fetchImpl,
    })).rejects.toMatchObject({ code: "ITEM_LIMIT_EXCEEDED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps the optional NVD API key server-side in the fixed request header", async () => {
    process.env.NVD_API_KEY = "server-only-test-key";
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("apiKey")).toBe("server-only-test-key");
      return new Response(JSON.stringify({
        resultsPerPage: 2000,
        startIndex: 0,
        totalResults: 0,
        vulnerabilities: [],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await nvdCveAdapter.collect({
      now: new Date("2099-01-02T00:00:00.000Z"),
      cursor: { version: 1 },
      settings: { initialLookbackHours: 24 },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
