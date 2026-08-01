import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const workflow = vi.hoisted(() => ({ claim: vi.fn(), complete: vi.fn(), fail: vi.fn(), due: vi.fn() }));
const dependencies = vi.hoisted(() => ({ loadCredential: vi.fn(), settingsSingle: vi.fn() }));
vi.mock("./trusted-workflow-client", () => ({ claimIocConnection: workflow.claim, completeIocIngestion: workflow.complete, failIocIngestion: workflow.fail, claimDueIocConnections: workflow.due }));
vi.mock("./credentials/repository", () => ({ loadCredential: dependencies.loadCredential }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ single: dependencies.settingsSingle }) }) }) }) }) }));
import { synchronizeIocConnection, executeClaimedIocSync } from "./orchestrator";
import { runDueIocSyncs } from "./scheduler";
import { threatFoxAdapter } from "./providers/threatfox/adapter";
const claim = { owner_id: "owner", connection_id: "connection", run_id: "run", lease_token: "secret", provider_key: "TEST_SYNTHETIC", cursor_value: null, cursor_version: null };
describe("executable IOC synchronization", () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.IOC_TEST_PROVIDER_ENABLED = "true"; workflow.complete.mockResolvedValue({ error: null }); workflow.fail.mockResolvedValue({ error: null }); dependencies.loadCredential.mockResolvedValue("credential-fixture"); dependencies.settingsSingle.mockResolvedValue({ data: { lookback_days: 1 } }); });
  it("claims, executes the deterministic adapter, and completes without network access", async () => { const fetchSpy = vi.spyOn(globalThis, "fetch"); workflow.claim.mockResolvedValue({ data: [claim], error: null }); const result = await synchronizeIocConnection("owner", "connection"); expect(result).toMatchObject({ status: "SUCCEEDED" }); expect(workflow.claim).toHaveBeenCalledWith("owner", "connection", "MANUAL"); expect(workflow.complete).toHaveBeenCalledWith(expect.objectContaining({ p_run_id: "run", p_items: expect.arrayContaining([expect.objectContaining({ tags: ["TEST", "SYNTHETIC"] })]) })); expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore(); });
  it("finalizes a controlled failure for an unknown immutable provider", async () => { const result = await executeClaimedIocSync({ ...claim, provider_key: "UNKNOWN" }); expect(result).toEqual({ error: "The provider is not configured." }); expect(workflow.fail).toHaveBeenCalledWith(expect.objectContaining({ p_error_code: "PROVIDER_NOT_CONFIGURED" })); });
  it("executes bounded scheduled claims", async () => { workflow.due.mockResolvedValueOnce({ data: [claim], error: null }).mockResolvedValueOnce({ data: [], error: null }); const result = await runDueIocSyncs({ batchSize: 2, concurrency: 1 }, Date.now() + 5000); expect(result).toEqual({ claimed: 1, succeeded: 1, failed: 0 }); expect(workflow.due).toHaveBeenCalledWith(1); });
  it.each([{}, { INVALID_IP: 1 }])("completes ThreatFox results with partial reasons %#", async skip_reason_counts => {
    const candidate = { provider_item_id: "safe-id", candidate_type: "DOMAIN" as const, normalized_value: "safe.example", original_value: "safe.example", network_port: null, provider_reference_url: null, threat_type: null, malware_family: null, confidence_score: 50, first_seen_at: "2026-08-01T07:35:20.000Z", last_seen_at: null, tags: ["THREATFOX"], metadata: {}, source_fingerprint: "a".repeat(64) };
    const skip = Object.keys(skip_reason_counts).length ? [{ provider_skip_reason: "INVALID_IP" as const }] : [];
    vi.spyOn(threatFoxAdapter, "sync").mockResolvedValueOnce({ status: "SUCCEEDED", items: [candidate, ...skip], diagnostics: { received_count: 1 + skip.length, eligible_count: 1 + skip.length, already_seen_count: 0, mapped_count: 1, mapping_skipped_count: skip.length, skip_reason_counts } });
    const result = await executeClaimedIocSync({ ...claim, provider_key: "THREATFOX" });
    expect(result).toMatchObject({ status: "SUCCEEDED" });
    expect(workflow.complete).toHaveBeenCalledWith(expect.objectContaining({ p_items: [candidate, ...skip] }));
    expect(workflow.fail).not.toHaveBeenCalled();
  });
  it("reports an exact safe manual bootstrap result", async () => {
    vi.spyOn(threatFoxAdapter, "sync").mockResolvedValueOnce({ status: "SUCCEEDED", items: [], nextCursor: "cursor-v2", diagnostics: { received_count: 600, eligible_count: 600, already_seen_count: 0, mapped_count: 417, mapping_skipped_count: 183, skip_reason_counts: { INVALID_PROVIDER_RECORD: 183 } } } as never);
    const result = await executeClaimedIocSync({ ...claim, provider_key: "THREATFOX" });
    expect(result).toEqual({ success: "Provider synchronized; 417 new observations processed; 183 provider records skipped safely.", status: "SUCCEEDED" });
  });
  it("finalizes an identical manual window as NOT_MODIFIED without persistence items", async () => {
    vi.spyOn(threatFoxAdapter, "sync").mockResolvedValueOnce({ status: "NOT_MODIFIED", items: [], nextCursor: "cursor-v2", diagnostics: { received_count: 600, eligible_count: 0, already_seen_count: 600, mapped_count: 0, mapping_skipped_count: 0, skip_reason_counts: {} } });
    const result = await executeClaimedIocSync({ ...claim, provider_key: "THREATFOX" });
    expect(result).toEqual({ success: "Provider checked; no new observations were available; 600 provider records were already seen.", status: "NOT_MODIFIED" });
    expect(workflow.complete).toHaveBeenCalledWith(expect.objectContaining({ p_status: "NOT_MODIFIED", p_next_cursor: "cursor-v2", p_items: [] }));
  });
  it("classifies a malformed adapter contract at the application boundary", async () => {
    vi.spyOn(threatFoxAdapter, "sync").mockResolvedValueOnce({ status: "SUCCEEDED", items: [], diagnostics: { received_count: 1, eligible_count: 1, already_seen_count: 0, mapped_count: 0, mapping_skipped_count: 1, skip_reason_counts: { UNKNOWN_REASON: 1 } } } as never);
    const result = await executeClaimedIocSync({ ...claim, provider_key: "THREATFOX" });
    expect(result).toEqual({ error: "The provider adapter returned an invalid internal result." });
    expect(workflow.fail).toHaveBeenCalledWith(expect.objectContaining({ p_error_code: "ADAPTER_RESULT_CONTRACT_INVALID" }));
    expect(workflow.complete).not.toHaveBeenCalled();
    expect(JSON.stringify(workflow.fail.mock.calls)).not.toContain("credential-fixture");
    expect(JSON.stringify(workflow.fail.mock.calls)).not.toContain("safe.example");
  });
  it("classifies PostgreSQL completion failures separately", async () => {
    workflow.complete.mockResolvedValueOnce({ error: { message: "database detail" } });
    const result = await executeClaimedIocSync(claim);
    expect(result).toEqual({ error: "The provider result could not be persisted safely." });
    expect(workflow.fail).toHaveBeenCalledWith(expect.objectContaining({ p_error_code: "IOC_COMPLETION_FAILED" }));
    expect(workflow.complete).toHaveBeenCalledTimes(1);
  });
});
