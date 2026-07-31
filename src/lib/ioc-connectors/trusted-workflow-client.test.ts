import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));

import { configureThreatFoxConnection } from "./trusted-workflow-client";

describe("ThreatFox trusted workflow RPC", () => {
  beforeEach(() => mocks.rpc.mockReset().mockResolvedValue({ data: "connection-id", error: null }));

  it("sends the exact PostgREST parameter names with a bounded integer key version", async () => {
    const parameters = {
      p_owner_id: "10000000-0000-4000-8000-000000000001",
      p_connection_id: "30000000-0000-4000-8000-000000000001",
      p_ciphertext_b64: "fixture-ciphertext",
      p_iv_b64: "fixture-iv",
      p_auth_tag_b64: "fixture-tag",
      p_key_version: 1,
      p_lookback_days: 1,
      p_scheduler_enabled: false,
      p_sync_interval_minutes: 60,
    };

    await configureThreatFoxConnection(parameters);

    expect(Number.isSafeInteger(parameters.p_key_version)).toBe(true);
    expect(parameters.p_key_version).toBeGreaterThanOrEqual(1);
    expect(parameters.p_key_version).toBeLessThanOrEqual(32_767);
    expect(mocks.rpc).toHaveBeenCalledWith("configure_threatfox_connection", parameters);
    expect(Object.keys(parameters)).toEqual([
      "p_owner_id", "p_connection_id", "p_ciphertext_b64", "p_iv_b64", "p_auth_tag_b64",
      "p_key_version", "p_lookback_days", "p_scheduler_enabled", "p_sync_interval_minutes",
    ]);
  });
});
