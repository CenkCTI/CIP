import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const workflow = vi.hoisted(() => ({ claim: vi.fn(), complete: vi.fn(), fail: vi.fn(), due: vi.fn() }));
vi.mock("./trusted-workflow-client", () => ({ claimIocConnection: workflow.claim, completeIocIngestion: workflow.complete, failIocIngestion: workflow.fail, claimDueIocConnections: workflow.due }));
import { synchronizeIocConnection, executeClaimedIocSync } from "./orchestrator";
import { runDueIocSyncs } from "./scheduler";
const claim = { owner_id: "owner", connection_id: "connection", run_id: "run", lease_token: "secret", provider_key: "TEST_SYNTHETIC", cursor_value: null, cursor_version: null };
describe("executable IOC synchronization", () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.IOC_TEST_PROVIDER_ENABLED = "true"; workflow.complete.mockResolvedValue({ error: null }); workflow.fail.mockResolvedValue({ error: null }); });
  it("claims, executes the deterministic adapter, and completes without network access", async () => { const fetchSpy = vi.spyOn(globalThis, "fetch"); workflow.claim.mockResolvedValue({ data: [claim], error: null }); const result = await synchronizeIocConnection("owner", "connection"); expect(result).toMatchObject({ status: "SUCCEEDED" }); expect(workflow.claim).toHaveBeenCalledWith("owner", "connection", "MANUAL"); expect(workflow.complete).toHaveBeenCalledWith(expect.objectContaining({ p_run_id: "run", p_items: expect.arrayContaining([expect.objectContaining({ tags: ["TEST", "SYNTHETIC"] })]) })); expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore(); });
  it("finalizes a controlled failure for an unknown immutable provider", async () => { const result = await executeClaimedIocSync({ ...claim, provider_key: "UNKNOWN" }); expect(result).toEqual({ error: "The provider is not configured." }); expect(workflow.fail).toHaveBeenCalledWith(expect.objectContaining({ p_error_code: "PROVIDER_NOT_CONFIGURED" })); });
  it("executes bounded scheduled claims", async () => { workflow.due.mockResolvedValueOnce({ data: [claim], error: null }).mockResolvedValueOnce({ data: [], error: null }); const result = await runDueIocSyncs({ batchSize: 2, concurrency: 1 }, Date.now() + 5000); expect(result).toEqual({ claimed: 1, succeeded: 1, failed: 0 }); expect(workflow.due).toHaveBeenCalledWith(1); });
});
