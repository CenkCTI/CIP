import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordTechnicalSignal: vi.fn(),
  completeTechnicalCollection: vi.fn(),
  failTechnicalCollection: vi.fn(),
  getTechnicalSourceAdapter: vi.fn(),
}));

vi.mock("@/lib/techint/signals/trusted-signal-client", () => ({
  recordTechnicalSignal: mocks.recordTechnicalSignal,
}));
vi.mock("./trusted-collection-client", () => ({
  completeTechnicalCollection: mocks.completeTechnicalCollection,
  failTechnicalCollection: mocks.failTechnicalCollection,
}));
vi.mock("./registry", () => ({
  getTechnicalSourceAdapter: mocks.getTechnicalSourceAdapter,
}));

import { runClaimedTechnicalCollection } from "./orchestrator";

const claim = {
  run_id: "10000000-0000-4000-8000-000000000010",
  owner_id: "10000000-0000-4000-8000-000000000001",
  connection_id: "10000000-0000-4000-8000-000000000020",
  source_key: "CISA_KEV" as const,
  settings: {},
  cursor: { version: 1 },
  lease_token: "a".repeat(64),
  lease_expires_at: "2099-01-01T00:05:00.000Z",
};

const mappedSignal = {
  signal: {
    signalType: "ACTIVE_EXPLOITATION" as const,
    canonicalKey: "cve:CVE-2099-12001",
    title: "Synthetic orchestrator fixture",
    summary: "A bounded source-backed fixture.",
    lifecycle: "ACTIVE" as const,
    severity: "UNKNOWN" as const,
    confidence: null,
    facts: { fixture: true },
    publishedAt: "2099-01-01T00:00:00.000Z",
    observedAt: "2099-01-01T00:00:00.000Z",
    effectiveAt: "2099-01-01T00:00:00.000Z",
  },
  observation: {
    sourceFamily: "VULNERABILITY" as const,
    sourceSystem: "cisa-kev",
    sourceRecordKey: "CVE-2099-12001",
    sourceRevisionKey: "fixture-1",
    sourceUrl: "https://www.cisa.gov/example.json",
    sourceTitle: "Synthetic orchestrator fixture",
    sourcePublishedAt: "2099-01-01T00:00:00.000Z",
    sourceModifiedAt: "2099-01-01T00:00:00.000Z",
    sourceObservedAt: "2099-01-01T00:00:00.000Z",
    receivedAt: "2099-01-01T00:00:01.000Z",
    effectiveAt: "2099-01-01T00:00:00.000Z",
    sourceSnapshot: { fixture: true },
  },
  entityAssertions: [],
};

function adapterResult() {
  return {
    recordsSeen: 1,
    recordsMapped: 1,
    signals: [mappedSignal],
    issues: [],
    nextCursor: { version: 1, catalogRelease: "fixture-1" },
  };
}

describe("TechINT collection orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTechnicalSourceAdapter.mockReturnValue({
      collect: vi.fn().mockResolvedValue(adapterResult()),
    });
  });

  it("records mapped signals only through the trusted recorder and completes the exact run", async () => {
    mocks.recordTechnicalSignal.mockResolvedValue({
      signal_id: "10000000-0000-4000-8000-000000000030",
      observation_id: "10000000-0000-4000-8000-000000000031",
      revision_id: "10000000-0000-4000-8000-000000000032",
      signal_created: true,
      observation_created: true,
      revision_created: true,
      duplicate_observation: false,
      disposition: "CURRENT",
      current_revision_number: 1,
      entity_assertions_created: 0,
    });
    mocks.completeTechnicalCollection.mockResolvedValue({
      run_id: claim.run_id,
      status: "SUCCEEDED",
      issues_created: 0,
    });

    const result = await runClaimedTechnicalCollection(claim, vi.fn() as unknown as typeof fetch);

    expect(result.success).toBe(true);
    expect(mocks.recordTechnicalSignal).toHaveBeenCalledTimes(1);
    expect(mocks.recordTechnicalSignal).toHaveBeenCalledWith({
      actorId: claim.owner_id,
      ...mappedSignal,
    });
    expect(mocks.completeTechnicalCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: claim.run_id,
        leaseToken: claim.lease_token,
        proposedCursor: { version: 1, catalogRelease: "fixture-1" },
        counters: expect.objectContaining({
          recordsSeen: 1,
          recordsMapped: 1,
          signalsCreated: 1,
          observationsCreated: 1,
          revisionsCreated: 1,
        }),
      }),
    );
    expect(mocks.failTechnicalCollection).not.toHaveBeenCalled();
  });

  it("fails the exact run without completing or advancing a cursor when persistence fails", async () => {
    mocks.recordTechnicalSignal.mockRejectedValue(new Error("database detail must not escape"));
    mocks.failTechnicalCollection.mockResolvedValue({ run_id: claim.run_id, status: "FAILED" });

    const result = await runClaimedTechnicalCollection(claim, vi.fn() as unknown as typeof fetch);

    expect(result).toMatchObject({ success: false, error: "SIGNAL_RECORDING_FAILED" });
    expect(mocks.completeTechnicalCollection).not.toHaveBeenCalled();
    expect(mocks.failTechnicalCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: claim.run_id,
        leaseToken: claim.lease_token,
        errorCode: "SIGNAL_RECORDING_FAILED",
        errorMessage: "A mapped Technical Signal could not be recorded.",
      }),
    );
    expect(JSON.stringify(result)).not.toContain("database detail");
  });
});
