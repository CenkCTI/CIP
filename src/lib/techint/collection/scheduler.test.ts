import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimDueTechnicalCollections: vi.fn(),
  runClaimedTechnicalCollection: vi.fn(),
}));

vi.mock("./trusted-collection-client", () => ({
  claimDueTechnicalCollections: mocks.claimDueTechnicalCollections,
}));
vi.mock("./orchestrator", () => ({
  runClaimedTechnicalCollection: mocks.runClaimedTechnicalCollection,
}));

import { runDueTechnicalCollections } from "./scheduler";

const claim = {
  run_id: "10000000-0000-4000-8000-000000000101",
  owner_id: "10000000-0000-4000-8000-000000000001",
  connection_id: "10000000-0000-4000-8000-000000000102",
  source_key: "NVD_CVE",
  settings: { initialLookbackHours: 24 },
  cursor: { version: 1 },
  lease_token: "b".repeat(64),
  lease_expires_at: "2099-01-01T00:05:00.000Z",
};

describe("TechINT collection scheduler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims bounded batches and reports independent outcomes", async () => {
    mocks.claimDueTechnicalCollections
      .mockResolvedValueOnce([claim, { ...claim, run_id: "10000000-0000-4000-8000-000000000103" }])
      .mockResolvedValueOnce([]);
    mocks.runClaimedTechnicalCollection
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });

    const result = await runDueTechnicalCollections(
      { enabled: true, batchSize: 5, concurrency: 2 },
      Date.now() + 60_000,
    );

    expect(result).toEqual({ claimed: 2, succeeded: 1, failed: 1, disabled: false });
    expect(mocks.claimDueTechnicalCollections).toHaveBeenNthCalledWith(1, 2);
    expect(mocks.runClaimedTechnicalCollection).toHaveBeenCalledTimes(2);
  });

  it("does not claim work after the shared scheduler deadline", async () => {
    const result = await runDueTechnicalCollections(
      { enabled: true, batchSize: 5, concurrency: 2 },
      Date.now() - 1,
    );
    expect(result).toEqual({ claimed: 0, succeeded: 0, failed: 0, disabled: false });
    expect(mocks.claimDueTechnicalCollections).not.toHaveBeenCalled();
  });

  it("returns a truthful disabled result", async () => {
    const result = await runDueTechnicalCollections(
      { enabled: false, batchSize: 5, concurrency: 2 },
      Date.now() + 60_000,
    );
    expect(result).toEqual({ claimed: 0, succeeded: 0, failed: 0, disabled: true });
  });
});
