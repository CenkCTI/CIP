import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordTechnicalSignal: vi.fn(),
  completeTechnicalCollection: vi.fn(),
  failTechnicalCollection: vi.fn(),
  getTechnicalSourceAdapter: vi.fn(),
}));

vi.mock("@/lib/techint/signals/trusted-signal-client", () => ({ recordTechnicalSignal: mocks.recordTechnicalSignal }));
vi.mock("./trusted-collection-client", () => ({
  completeTechnicalCollection: mocks.completeTechnicalCollection,
  failTechnicalCollection: mocks.failTechnicalCollection,
}));
vi.mock("./registry", () => ({ getTechnicalSourceAdapter: mocks.getTechnicalSourceAdapter }));

import { runClaimedTechnicalCollection } from "./orchestrator";

const claim = {
  run_id: "10000000-0000-4000-8000-000000000010",
  owner_id: "10000000-0000-4000-8000-000000000001",
  connection_id: "10000000-0000-4000-8000-000000000020",
  source_key: "NVD_CVE" as const,
  settings: { initialLookbackHours: 24 },
  cursor: { version: 1 },
  lease_token: "a".repeat(64),
  lease_expires_at: "2099-01-01T00:05:00.000Z",
};

const mappedSignal = {
  signal: {
    signalType: "VULNERABILITY_CHANGE" as const,
    canonicalKey: "cve:CVE-2099-12001",
    title: "NVD failure fixture",
    summary: "Safe diagnostic fixture.",
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
    sourceSystem: "nvd-cve",
    sourceRecordKey: "CVE-2099-12001",
    sourceRevisionKey: "2099-01-01T00:00:00.000Z",
    sourceUrl: "https://nvd.nist.gov/vuln/detail/CVE-2099-12001",
    sourceTitle: "NVD failure fixture",
    sourcePublishedAt: "2099-01-01T00:00:00.000Z",
    sourceModifiedAt: "2099-01-01T00:00:00.000Z",
    sourceObservedAt: "2099-01-01T00:00:00.000Z",
    receivedAt: "2099-01-01T00:00:01.000Z",
    effectiveAt: "2099-01-01T00:00:00.000Z",
    sourceSnapshot: { fixture: true },
  },
  entityAssertions: [],
};

describe("TechINT collection failure diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTechnicalSourceAdapter.mockReturnValue({
      collect: vi.fn().mockResolvedValue({
        recordsSeen: 1,
        recordsMapped: 1,
        signals: [mappedSignal],
        issues: [],
        nextCursor: { version: 1, lastModifiedWatermark: "2099-01-01T00:00:00.000Z" },
      }),
    });
  });

  it("stores only the bounded source record identity when trusted persistence fails", async () => {
    mocks.recordTechnicalSignal.mockRejectedValue(new Error("sensitive database detail"));
    mocks.failTechnicalCollection.mockResolvedValue({ run_id: claim.run_id, status: "FAILED" });

    const result = await runClaimedTechnicalCollection(claim, vi.fn() as unknown as typeof fetch);

    expect(result).toMatchObject({ success: false, error: "SIGNAL_RECORDING_FAILED" });
    expect(mocks.failTechnicalCollection).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: "SIGNAL_RECORDING_FAILED",
      issues: [{
        kind: "ERROR",
        code: "SIGNAL_RECORDING_FAILED",
        message: "A mapped Technical Signal could not be recorded.",
        sourceRecordKey: "CVE-2099-12001",
      }],
    }));
    expect(JSON.stringify(mocks.failTechnicalCollection.mock.calls)).not.toContain("sensitive database detail");
  });
});
