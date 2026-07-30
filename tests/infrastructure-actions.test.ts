import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const CLUSTER = "22222222-2222-4222-8222-222222222222";
const TARGET = "33333333-3333-4333-8333-333333333333";
const requireOwnedProject = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("@/lib/projects/ownership", () => ({ requireOwnedProject }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Mutation = { table: string; operation: string; values?: unknown };
function database(options: {
  cluster?: Record<string, unknown> | null;
  fail?: { table: string; operation: string };
  missing?: string;
} = {}) {
  const mutations: Mutation[] = [];
  const from = vi.fn((table: string) => {
    let operation = "select";
    let values: unknown;
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.insert = vi.fn((input) => {
      operation = "insert";
      values = input;
      mutations.push({ table, operation, values });
      return chain;
    });
    chain.update = vi.fn((input) => {
      operation = "update";
      values = input;
      mutations.push({ table, operation, values });
      return chain;
    });
    chain.delete = vi.fn(() => {
      operation = "delete";
      mutations.push({ table, operation });
      return chain;
    });
    chain.single = vi.fn(async () => {
      if (options.fail?.table === table && options.fail.operation === operation) {
        return { data: null, error: { code: "DATABASE_ERROR" } };
      }
      if (options.missing === table) {
        return { data: null, error: { code: "PGRST116" } };
      }
      if (table === "infrastructure_clusters" && operation === "select") {
        return {
          data: options.cluster ?? {
            id: CLUSTER,
            status: "ASSESSED",
            pre_archive_status: null,
          },
          error: null,
        };
      }
      return { data: { id: TARGET }, error: null };
    });
    return chain;
  });
  return { from, mutations };
}

function clusterForm() {
  const form = new FormData();
  Object.entries({
    name: "Infrastructure",
    description: "",
    status: "ASSESSED",
    confidence: "HIGH",
    technical_purpose: "C2",
    current_assessment: "Shared infrastructure",
    operational_relevance: "Block and monitor",
    first_observed_at: "",
    last_observed_at: "",
  }).forEach(([key, value]) => form.set(key, value));
  return form;
}

function memberForm() {
  const form = new FormData();
  Object.entries({
    indicator_id: TARGET,
    status: "POSSIBLE",
    role: "COMMAND_AND_CONTROL",
    confidence: "MEDIUM",
    rationale: "Shared certificate and hosting evidence.",
    first_observed_at: "",
    last_observed_at: "",
  }).forEach(([key, value]) => form.set(key, value));
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Infrastructure server action persistence and boundaries", () => {
  it("creates a cluster for its owner and only redirects after persistence", async () => {
    const db = database();
    requireOwnedProject.mockResolvedValue({
      projectId: PROJECT,
      user: { id: "owner" },
      supabase: { from: db.from },
    });
    const { createCluster } = await import("@/app/projects/[id]/infrastructure-actions");
    await expect(createCluster(PROJECT, clusterForm())).rejects.toThrow(
      `REDIRECT:/projects/${PROJECT}/infrastructure/${TARGET}`,
    );
    expect(db.mutations).toContainEqual(
      expect.objectContaining({ table: "infrastructure_clusters", operation: "insert" }),
    );
    expect(db.mutations.every((item) => item.table === "infrastructure_clusters")).toBe(true);
  });

  it("reports a controlled cluster update persistence failure", async () => {
    const db = database({ fail: { table: "infrastructure_clusters", operation: "update" } });
    requireOwnedProject.mockResolvedValue({ projectId: PROJECT, user: { id: "owner" }, supabase: { from: db.from } });
    const { updateCluster } = await import("@/app/projects/[id]/infrastructure-actions");
    await expect(updateCluster(PROJECT, CLUSTER, clusterForm())).rejects.toThrow(
      /Cluster%20changes%20could%20not%20be%20saved/,
    );
  });

  it("archives and restores the prior analytical status", async () => {
    const archiveDb = database({ cluster: { id: CLUSTER, status: "ASSESSED", pre_archive_status: null } });
    requireOwnedProject.mockResolvedValueOnce({ projectId: PROJECT, user: { id: "owner" }, supabase: { from: archiveDb.from } });
    const { setClusterArchived } = await import("@/app/projects/[id]/infrastructure-actions");
    await expect(setClusterArchived(PROJECT, CLUSTER, true)).rejects.toThrow(/REDIRECT/);
    expect(archiveDb.mutations.find((item) => item.operation === "update")?.values).toMatchObject({ status: "ARCHIVED", pre_archive_status: "ASSESSED" });

    const restoreDb = database({ cluster: { id: CLUSTER, status: "ARCHIVED", pre_archive_status: "ASSESSED" } });
    requireOwnedProject.mockResolvedValueOnce({ projectId: PROJECT, user: { id: "owner" }, supabase: { from: restoreDb.from } });
    await expect(setClusterArchived(PROJECT, CLUSTER, false)).rejects.toThrow(/REDIRECT/);
    expect(restoreDb.mutations.find((item) => item.operation === "update")?.values).toMatchObject({ status: "ASSESSED", pre_archive_status: null });
  });

  it("returns a duplicate-safe membership message", async () => {
    const db = database({ fail: { table: "infrastructure_cluster_members", operation: "insert" } });
    requireOwnedProject.mockResolvedValue({ projectId: PROJECT, user: { id: "owner" }, supabase: { from: db.from } });
    const { saveMember } = await import("@/app/projects/[id]/infrastructure-actions");
    await expect(saveMember(PROJECT, CLUSTER, null, memberForm())).rejects.toThrow(/already%20belong/);
  });

  it("rejects a cross-Investigation Indicator before membership mutation", async () => {
    const db = database({ missing: "indicators" });
    requireOwnedProject.mockResolvedValue({ projectId: PROJECT, user: { id: "owner" }, supabase: { from: db.from } });
    const { saveMember } = await import("@/app/projects/[id]/infrastructure-actions");
    await expect(saveMember(PROJECT, CLUSTER, null, memberForm())).rejects.toThrow(/not%20available/);
    expect(db.mutations.some((item) => item.table === "infrastructure_cluster_members")).toBe(false);
  });

  it.each([
    ["source", "sources", "Source"],
    ["evidence", "evidence", "Evidence"],
    ["enrichment", "enrichment_results", "Enrichment%20result"],
  ])("rejects cross-Investigation %s support", async (kind, table, message) => {
    const db = database({ missing: table });
    requireOwnedProject.mockResolvedValue({ projectId: PROJECT, user: { id: "owner" }, supabase: { from: db.from } });
    const form = new FormData();
    form.set("cluster_member_id", "");
    form.set("kind", kind);
    form.set("target_id", TARGET);
    form.set("note", "support");
    const { attachSupport } = await import("@/app/projects/[id]/infrastructure-actions");
    await expect(attachSupport(PROJECT, CLUSTER, form)).rejects.toThrow(new RegExp(`${message}.*not%20available`));
    expect(db.mutations.some((item) => item.table === "infrastructure_cluster_support")).toBe(false);
  });

  it("reports support unlink persistence failure", async () => {
    const db = database({ fail: { table: "infrastructure_cluster_support", operation: "delete" } });
    requireOwnedProject.mockResolvedValue({ projectId: PROJECT, user: { id: "owner" }, supabase: { from: db.from } });
    const { unlinkSupport } = await import("@/app/projects/[id]/infrastructure-actions");
    await expect(unlinkSupport(PROJECT, CLUSTER, TARGET)).rejects.toThrow(/could%20not%20be%20unlinked/);
  });

  it("maps a second-user ownership denial to a controlled not-found message", async () => {
    requireOwnedProject.mockRejectedValue(new Error("Investigation not found"));
    const { updateCluster } = await import("@/app/projects/[id]/infrastructure-actions");
    await expect(updateCluster(PROJECT, CLUSTER, clusterForm())).rejects.toThrow(/Investigation%20not%20found/);
  });
});
