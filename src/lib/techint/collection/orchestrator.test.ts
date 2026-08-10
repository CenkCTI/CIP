import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordTechnicalSignal: vi.fn(),
  completeTechnicalCollection: vi.fn(),
  failTechnicalCollection: vi.fn(),
  getTechnicalSourceAdapter: vi.fn(),
  reconcileNewTechnicalEntitiesWorkflow: vi.fn(),
  evaluateTechnicalSignalIntelligenceBatchWorkflow: vi.fn(),
}));

vi.mock("@/lib/techint/signals/trusted-signal-client", () => ({
  recordTechnicalSignal: mocks.recordTechnicalSignal,
}));
vi.mock("@/lib/techint/entities/trusted-client", () => ({
  reconcileNewTechnicalEntitiesWorkflow: mocks.reconcileNewTechnicalEntitiesWorkflow,
}));
vi.mock("@/lib/techint/intelligence/trusted-client", () => ({
  evaluateTechnicalSignalIntelligenceBatchWorkflow: mocks.evaluateTechnicalSignalIntelligenceBatchWorkflow,
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

function recordedResult() {
  return {
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
  };
}

function manyAdapterResult(count: number) {
  const signals = Array.from({ length: count }, (_, index) => ({
    ...mappedSignal,
    signal: {
      ...mappedSignal.signal,
      canonicalKey: `cve:CVE-2099-${String(13000 + index)}`,
      title: `Synthetic orchestrator fixture ${index}`,
    },
    observation: {
      ...mappedSignal.observation,
      sourceRecordKey: `CVE-2099-${String(13000 + index)}`,
      sourceRevisionKey: `fixture-${index}`,
      sourceTitle: `Synthetic orchestrator fixture ${index}`,
    },
  }));
  return {
    recordsSeen: count,
    recordsMapped: count,
    signals,
    issues: [],
    nextCursor: { version: 1, catalogRelease: "fixture-many" },
  };
}

describe("TechINT collection orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTechnicalSourceAdapter.mockReturnValue({ collect: vi.fn().mockResolvedValue(adapterResult()) });
    mocks.recordTechnicalSignal.mockResolvedValue(recordedResult());
    mocks.completeTechnicalCollection.mockResolvedValue({
      run_id: claim.run_id,
      status: "SUCCEEDED",
      issues_created: 0,
    });
    mocks.evaluateTechnicalSignalIntelligenceBatchWorkflow.mockResolvedValue({
      requested: 1,
      evaluated: 1,
      profile_matches_changed: 0,
      engine_version: "2.3E-v1",
    });
  });

  it("records mapped signals, completes the source run, then evaluates derived intelligence", async () => {
    const result = await runClaimedTechnicalCollection(claim, vi.fn() as unknown as typeof fetch);

    expect(result.success).toBe(true);
    expect(mocks.recordTechnicalSignal).toHaveBeenCalledTimes(1);
    expect(mocks.recordTechnicalSignal).toHaveBeenCalledWith({ actorId: claim.owner_id, ...mappedSignal });
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
    expect(mocks.evaluateTechnicalSignalIntelligenceBatchWorkflow).toHaveBeenCalledWith({
      p_actor: claim.owner_id,
      p_signal_ids: [recordedResult().signal_id],
    });
    expect(result).toMatchObject({
      intelligenceEvaluation: {
        batches: 1,
        attempts: 1,
        requested: 1,
        evaluated: 1,
        profileMatchesChanged: 0,
        failed: 0,
        complete: true,
      },
    });
    expect(mocks.failTechnicalCollection).not.toHaveBeenCalled();
  });

  it("evaluates a duplicate replay so a bounded source re-sync can backfill Phase 2.3E projections", async () => {
    mocks.recordTechnicalSignal.mockResolvedValue({
      ...recordedResult(),
      revision_id: null,
      signal_created: false,
      observation_created: false,
      revision_created: false,
      duplicate_observation: true,
      entity_assertions_created: 0,
    });

    const result = await runClaimedTechnicalCollection(claim, vi.fn() as unknown as typeof fetch);
    expect(result.success).toBe(true);
    expect(mocks.evaluateTechnicalSignalIntelligenceBatchWorkflow).toHaveBeenCalledWith({
      p_actor: claim.owner_id,
      p_signal_ids: [recordedResult().signal_id],
    });
    expect(result).toMatchObject({
      counters: expect.objectContaining({ duplicateObservations: 1 }),
      intelligenceEvaluation: { requested: 1, evaluated: 1, failed: 0, complete: true },
    });
  });

  it("retries a failed heavy intelligence batch in smaller chunks and drains the remaining queue", async () => {
    const signalCount = 60;
    mocks.getTechnicalSourceAdapter.mockReturnValue({ collect: vi.fn().mockResolvedValue(manyAdapterResult(signalCount)) });
    let recordIndex = 0;
    mocks.recordTechnicalSignal.mockImplementation(async () => ({
      ...recordedResult(),
      signal_id: `10000000-0000-4000-8000-${String(200000000000 + recordIndex++).padStart(12, "0")}`,
    }));
    mocks.evaluateTechnicalSignalIntelligenceBatchWorkflow.mockImplementation(async (parameters: { p_signal_ids: string[] }) => {
      if (parameters.p_signal_ids.length > 10) throw new Error("statement timeout");
      return {
        requested: parameters.p_signal_ids.length,
        evaluated: parameters.p_signal_ids.length,
        profile_matches_changed: 0,
        engine_version: "2.3E-v1",
      };
    });

    const result = await runClaimedTechnicalCollection(claim, vi.fn() as unknown as typeof fetch);

    expect(result.success).toBe(true);
    expect(mocks.evaluateTechnicalSignalIntelligenceBatchWorkflow.mock.calls.map(([parameters]) => parameters.p_signal_ids.length)).toEqual([
      50, 10, 10, 10, 10, 10, 10,
    ]);
    expect(result).toMatchObject({
      intelligenceEvaluation: {
        batches: 6,
        attempts: 7,
        requested: 60,
        evaluated: 60,
        failed: 0,
        complete: true,
      },
    });
    expect(mocks.failTechnicalCollection).not.toHaveBeenCalled();
  });

  it("keeps a successful collection authoritative and reports incomplete derived intelligence", async () => {
    mocks.evaluateTechnicalSignalIntelligenceBatchWorkflow.mockRejectedValue(new Error("projection unavailable"));
    const result = await runClaimedTechnicalCollection(claim, vi.fn() as unknown as typeof fetch);
    expect(result.success).toBe(true);
    expect(result).toMatchObject({
      intelligenceEvaluation: {
        batches: 0,
        attempts: 1,
        requested: 1,
        evaluated: 0,
        failed: 1,
        complete: false,
      },
    });
    expect(mocks.failTechnicalCollection).not.toHaveBeenCalled();
  });

  it("fails the exact run without completing or advancing a cursor when persistence fails", async () => {
    mocks.recordTechnicalSignal.mockRejectedValue(new Error("database detail must not escape"));
    mocks.failTechnicalCollection.mockResolvedValue({ run_id: claim.run_id, status: "FAILED" });
    const result = await runClaimedTechnicalCollection(claim, vi.fn() as unknown as typeof fetch);

    expect(result).toMatchObject({ success: false, error: "SIGNAL_RECORDING_FAILED" });
    expect(mocks.completeTechnicalCollection).not.toHaveBeenCalled();
    expect(mocks.evaluateTechnicalSignalIntelligenceBatchWorkflow).not.toHaveBeenCalled();
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
