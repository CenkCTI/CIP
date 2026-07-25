import { describe, expect, it } from "vitest";
import { safeAiErrorMessage } from "@/lib/ai/byok/errors";

describe("BYOK generation error mapping", () => {
  it("returns safe specific messages for BYOK and provider failures", () => {
    expect(safeAiErrorMessage("byok_required")).toContain("Reconnect your BYOK provider");
    expect(safeAiErrorMessage("byok_expired")).toContain("expired");
    expect(safeAiErrorMessage("byok_binding_mismatch")).toContain("no longer valid");
    expect(safeAiErrorMessage("byok_consent_required")).toContain("consent");
    expect(safeAiErrorMessage("provider_rate_limited")).toContain("rate limit");
    expect(safeAiErrorMessage("provider_unreachable")).toContain("unreachable");
    expect(safeAiErrorMessage("nvidia_output_exhausted")).toContain("NVIDIA");
    expect(safeAiErrorMessage("malformed_output")).toContain("schema");
  });
});
