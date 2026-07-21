import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRelationshipRpcPayload,
  parseRelationshipSelections,
  ctiDetailPath,
} from "@/lib/cti-schema";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));

const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
];
const projectId = "10000000-0000-4000-8000-000000000001";
const entityId = "20000000-0000-4000-8000-000000000001";
const tableByTab = {
  actors: "threat_actors",
  campaigns: "campaigns",
  indicators: "indicators",
  malware: "malware",
  cves: "cves",
  mitre: "mitre_techniques",
} as const;
const validPayloads = {
  actors: { name: "Actor" },
  campaigns: { name: "Campaign" },
  indicators: { value: "example.com", type: "DOMAIN", confidence: "HIGH" },
  malware: { name: "Malware", hashes: "{}" },
  cves: { cve_id: "CVE-2026-12345", severity: "HIGH", exploit_status: "POC" },
  mitre: {
    technique_id: "T1059.001",
    technique_name: "PowerShell",
    tactic: "Execution",
  },
} as const;
type Tab = keyof typeof tableByTab;
function fdFor(tab: Tab, extra?: Record<string, string[] | string>) {
  const fd = new FormData();
  Object.entries(validPayloads[tab]).forEach(([k, v]) => fd.set(k, String(v)));
  Object.entries(extra ?? {}).forEach(([k, v]) =>
    Array.isArray(v) ? v.forEach((x) => fd.append(k, x)) : fd.set(k, v),
  );
  return fd;
}
function createSupabase(
  opts: {
    duplicate?: boolean;
    relatedCount?: number;
    rpcError?: boolean;
    deleteError?: boolean;
  } = {},
) {
  const calls: Array<{
    table?: string;
    op: string;
    payload?: unknown;
    filters?: Array<[string, unknown]>;
  }> = [];
  const makeBuilder = (table: string) => {
    const call = {
      table,
      op: "query",
      payload: undefined as unknown,
      filters: [] as Array<[string, unknown]>,
    };
    calls.push(call);
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn((col: string, val: unknown) => {
        call.filters.push([col, val]);
        return builder;
      }),
      in: vi.fn((col: string, vals: unknown) => {
        call.filters.push([col, vals]);
        return Promise.resolve({
          count: opts.relatedCount ?? (Array.isArray(vals) ? vals.length : 0),
          error: null,
        });
      }),
      insert: vi.fn((payload: unknown) => {
        call.op = "insert";
        call.payload = payload;
        return builder;
      }),
      update: vi.fn((payload: unknown) => {
        call.op = "update";
        call.payload = payload;
        return builder;
      }),
      delete: vi.fn(() => {
        call.op = "delete";
        return builder;
      }),
      single: vi.fn(() => {
        if (table === "projects")
          return Promise.resolve({
            data: { id: projectId, owner_id: "user-1" },
            error: null,
          });
        if (call.op === "insert")
          return Promise.resolve(
            opts.duplicate
              ? { data: null, error: { code: "23505", message: "duplicate" } }
              : { data: { id: entityId }, error: null },
          );
        return Promise.resolve({
          data: { id: entityId, project_id: projectId },
          error: null,
        });
      }),
      then: undefined,
    };
    // update/delete await the builder directly in actions; make it thenable only after op is set.
    Object.defineProperty(builder, "then", {
      get() {
        return call.op === "update" || call.op === "delete"
          ? Promise.resolve({
              error:
                call.op === "delete" && opts.deleteError
                  ? { message: "bad" }
                  : null,
            }).then.bind(
              Promise.resolve({
                error:
                  call.op === "delete" && opts.deleteError
                    ? { message: "bad" }
                    : null,
              }),
            )
          : undefined;
      },
    });
    return builder;
  };
  return {
    calls,
    supabase: {
      from: vi.fn((table: string) => makeBuilder(table)),
      rpc: vi.fn(() =>
        Promise.resolve(
          opts.rpcError
            ? {
                data: { ok: false, error: "invalid_relationship" },
                error: null,
              }
            : { data: { ok: true }, error: null },
        ),
      ),
    },
  };
}
beforeEach(async () => {
  vi.clearAllMocks();
  const auth = await import("@/lib/auth");
  vi.mocked(auth.requireUser).mockReset();
});
async function wire(opts?: Parameters<typeof createSupabase>[0]) {
  const ctx = createSupabase(opts);
  const auth = await import("@/lib/auth");
  vi.mocked(auth.requireUser).mockResolvedValue({
    supabase: ctx.supabase as never,
    user: { id: "user-1" } as never,
  });
  return ctx;
}
describe("cti relationship helpers", () => {
  it("selecting three relationships sends all three IDs to the RPC", () => {
    const fd = new FormData();
    ids.forEach((id) => fd.append("threat_actor_ids", id));
    const parsed = parseRelationshipSelections(fd);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(
      buildRelationshipRpcPayload("campaigns", parsed.data).p_threat_actor_ids,
    ).toEqual(ids);
  });
  it("builds ownership-gated detail route paths", () => {
    expect(ctiDetailPath("project-1", "actors", "actor-1")).toBe(
      "/projects/project-1/actors/actor-1",
    );
  });
  it("deselection removes only the omitted relationship from the replacement payload", () => {
    const fd = new FormData();
    fd.append("threat_actor_ids", ids[0]);
    fd.append("threat_actor_ids", ids[2]);
    const parsed = parseRelationshipSelections(fd);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(
      buildRelationshipRpcPayload("campaigns", parsed.data).p_threat_actor_ids,
    ).toEqual([ids[0], ids[2]]);
  });
});
describe("cti server actions", () => {
  it.each(Object.keys(tableByTab) as Tab[])(
    "creates %s records",
    async (tab) => {
      const { supabase } = await wire();
      const { createCti } = await import("@/app/actions");
      const result = await createCti(tab, projectId, {}, fdFor(tab));
      expect(result.success).toBe("CTI record created.");
      expect(supabase.from).toHaveBeenCalledWith(tableByTab[tab]);
      expect(supabase.rpc).toHaveBeenCalledWith(
        "replace_cti_relationships",
        expect.objectContaining({
          p_project_id: projectId,
          p_entity_id: entityId,
          p_entity_type: tab,
        }),
      );
    },
  );
  it.each(Object.keys(tableByTab) as Tab[])(
    "updates %s records scoped by project and entity",
    async (tab) => {
      const { calls } = await wire();
      const { updateCti } = await import("@/app/actions");
      const result = await updateCti(tab, projectId, entityId, {}, fdFor(tab));
      expect(result.success).toBe("CTI record updated.");
      const update = calls.find((c) => c.op === "update");
      expect(update?.filters).toEqual(
        expect.arrayContaining([
          ["project_id", projectId],
          ["id", entityId],
        ]),
      );
    },
  );
  it.each(Object.keys(tableByTab) as Tab[])(
    "deletes %s records scoped by project and entity",
    async (tab) => {
      const { calls } = await wire();
      const { deleteCti } = await import("@/app/actions");
      const fd = new FormData();
      fd.set("confirm", "Name");
      const result = await deleteCti(tab, projectId, entityId, "Name", fd);
      expect(result.success).toBe("CTI record deleted.");
      const del = calls.find((c) => c.op === "delete");
      expect(del?.filters).toEqual(
        expect.arrayContaining([
          ["project_id", projectId],
          ["id", entityId],
        ]),
      );
    },
  );
  it("returns duplicate conflict response", async () => {
    await wire({ duplicate: true });
    const { createCti } = await import("@/app/actions");
    await expect(
      createCti("actors", projectId, {}, fdFor("actors")),
    ).resolves.toEqual({
      error: "A matching record already exists in this project.",
    });
  });
  it("passes every selected relationship ID to replace_cti_relationships", async () => {
    const { supabase } = await wire();
    const { createCti } = await import("@/app/actions");
    await createCti(
      "campaigns",
      projectId,
      {},
      fdFor("campaigns", { threat_actor_ids: ids }),
    );
    expect(supabase.rpc).toHaveBeenCalledWith(
      "replace_cti_relationships",
      expect.objectContaining({ p_threat_actor_ids: ids }),
    );
  });
  it("rejects cross-project related IDs before RPC", async () => {
    const { supabase } = await wire({ relatedCount: 1 });
    const { createCti } = await import("@/app/actions");
    const result = await createCti(
      "campaigns",
      projectId,
      {},
      fdFor("campaigns", { threat_actor_ids: ids }),
    );
    expect(result.error).toBe(
      "One or more related records could not be linked.",
    );
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it("returns a controlled error when the RPC fails", async () => {
    await wire({ rpcError: true });
    const { createCti } = await import("@/app/actions");
    const result = await createCti(
      "campaigns",
      projectId,
      {},
      fdFor("campaigns", { threat_actor_ids: [ids[0]] }),
    );
    expect(result.error).toBe("invalid_relationship");
  });
  it("requires delete confirmation", async () => {
    await wire();
    const { deleteCti } = await import("@/app/actions");
    const result = await deleteCti(
      "actors",
      projectId,
      entityId,
      "Actor",
      new FormData(),
    );
    expect(result.error).toMatch(/confirm/);
  });
  it("rejects malformed relationship UUIDs", async () => {
    const { supabase } = await wire();
    const { createCti } = await import("@/app/actions");
    const result = await createCti(
      "campaigns",
      projectId,
      {},
      fdFor("campaigns", { threat_actor_ids: ["bad"] }),
    );
    expect(result.error).toBe("threat actor ids contains an invalid ID.");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
