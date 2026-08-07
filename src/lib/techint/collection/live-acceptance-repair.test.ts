import { afterEach, describe, expect, it, vi } from "vitest";
import { nvdCveAdapter } from "./providers/nvd-cve";

const originalNvdKey = process.env.NVD_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (originalNvdKey === undefined) delete process.env.NVD_API_KEY;
  else process.env.NVD_API_KEY = originalNvdKey;
});

describe("Phase 2.3C live acceptance repairs", () => {
  it("starts NVD collection with a bounded 250-record page size", async () => {
    delete process.env.NVD_API_KEY;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("resultsPerPage")).toBe("250");
      expect(url.searchParams.get("startIndex")).toBe("0");
      return new Response(JSON.stringify({
        resultsPerPage: 250,
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

  it("shrinks the same NVD page after an 8 MiB body rejection and preserves request pacing", async () => {
    vi.useFakeTimers();
    let request = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      request += 1;
      const url = new URL(String(input));
      expect(url.searchParams.get("startIndex")).toBe("0");
      if (request === 1) {
        expect(url.searchParams.get("resultsPerPage")).toBe("250");
        return new Response("{}", {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-length": String(8 * 1024 * 1024 + 1),
          },
        });
      }
      expect(url.searchParams.get("resultsPerPage")).toBe("125");
      return new Response(JSON.stringify({
        resultsPerPage: 125,
        startIndex: 0,
        totalResults: 0,
        vulnerabilities: [],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const collection = nvdCveAdapter.collect({
      now: new Date("2099-01-02T00:00:00.000Z"),
      cursor: { version: 1 },
      settings: { initialLookbackHours: 24 },
      fetchImpl,
    });

    await vi.advanceTimersByTimeAsync(6500);
    const result = await collection;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.recordsSeen).toBe(0);
  });

  it("uses the NVD-specific 30-second timeout and retries a timed-out page at 125 records", async () => {
    vi.useFakeTimers();
    let request = 0;
    const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      request += 1;
      const url = new URL(String(input));
      expect(url.searchParams.get("startIndex")).toBe("0");
      if (request === 1) {
        expect(url.searchParams.get("resultsPerPage")).toBe("250");
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
        });
      }
      expect(url.searchParams.get("resultsPerPage")).toBe("125");
      return Promise.resolve(new Response(JSON.stringify({
        resultsPerPage: 125,
        startIndex: 0,
        totalResults: 0,
        vulnerabilities: [],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    }) as unknown as typeof fetch;

    const collection = nvdCveAdapter.collect({
      now: new Date("2099-01-02T00:00:00.000Z"),
      cursor: { version: 1 },
      settings: { initialLookbackHours: 24 },
      fetchImpl,
    });

    await vi.advanceTimersByTimeAsync(29999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(6500);
    const result = await collection;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.recordsSeen).toBe(0);
  });

  it("fails closed before a second successful page when an NVD window exceeds the 2,000-record run bound", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      resultsPerPage: 250,
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
        resultsPerPage: 250,
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
