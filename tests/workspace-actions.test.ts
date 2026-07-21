import { beforeEach, describe, expect, it, vi } from "vitest";

type Table = "projects" | "research_notes" | "evidence" | "timeline_events" | "project_tasks";
type MockOptions = {
  userId?: string;
  projectOwnerId?: string;
  projectMissing?: boolean;
  childMissing?: boolean;
  metadataUpdateError?: string;
  metadataInsertError?: string;
  signedUploadError?: string;
  signedDownloadError?: string;
};

const requireUserMock = vi.fn();
const revalidatePathMock = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: requireUserMock, getUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

function fd(values: Record<string, string>) { const form = new FormData(); for (const [key, value] of Object.entries(values)) form.set(key, value); return form; }
const validNote = () => fd({ title: "Updated note", content: "Body", tags: "ioc" });
const validEvidence = () => fd({ title: "Updated evidence", type: "ARTICLE", source_url: "https://example.test", collection_date: "2026-07-21T00:00:00.000Z", description: "desc", tags: "tag" });
const validEvent = () => fd({ event_name: "Updated event", event_date: "2026-07-21T00:00:00.000Z", description: "desc", related_entity_type: "", related_entity_id: "" });
const validTask = () => fd({ task_name: "Updated task", description: "desc", status: "IN_PROGRESS", priority: "HIGH", assigned_user_id: "user-1", deadline: "2026-07-22T00:00:00.000Z" });

function makeSupabase(options: MockOptions = {}) {
  const remove = vi.fn(async () => ({ data: null, error: null }));
  const createSignedUploadUrl = vi.fn(async () => options.signedUploadError ? { data: null, error: { message: options.signedUploadError } } : { data: { token: "short-upload-token" }, error: null });
  const createSignedUrl = vi.fn(async () => options.signedDownloadError ? { data: null, error: { message: options.signedDownloadError } } : { data: { signedUrl: "https://signed.example/evidence?token=short" }, error: null });
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const deletes: Table[] = [];
  const from = vi.fn((table: Table) => {
    const state: { op?: "select" | "insert" | "update" | "delete"; payload?: unknown; filters: Record<string, string> } = { filters: {} };
    const chain = {
      select: vi.fn(() => { state.op = "select"; return chain; }),
      insert: vi.fn((payload: unknown) => { state.op = "insert"; state.payload = payload; inserts.push(payload); return chain; }),
      update: vi.fn((payload: unknown) => { state.op = "update"; state.payload = payload; updates.push(payload); return chain; }),
      delete: vi.fn(() => { state.op = "delete"; deletes.push(table); return chain; }),
      eq: vi.fn((key: string, value: string) => { state.filters[key] = value; return chain; }),
      single: vi.fn(async () => {
        if (table === "projects") {
          if (options.projectMissing) return { data: null, error: { message: "missing" } };
          return { data: { id: state.filters.id, owner_id: options.projectOwnerId ?? options.userId ?? "user-1" }, error: null };
        }
        if (state.op === "select" && table === "evidence" && !options.childMissing) return { data: { id: state.filters.id, project_id: state.filters.project_id, storage_path: "user-1/project-1/old.pdf", source_url: null }, error: null };
        if (state.op === "select" && !options.childMissing) return { data: { id: state.filters.id, project_id: state.filters.project_id }, error: null };
        return { data: null, error: { message: "child missing" } };
      }),
      then: (resolve: (value: { data: null; error: null | { message: string } }) => void) => {
        if (state.op === "insert" && options.metadataInsertError) return resolve({ data: null, error: { message: options.metadataInsertError } });
        if (state.op === "update" && options.metadataUpdateError) return resolve({ data: null, error: { message: options.metadataUpdateError } });
        return resolve({ data: null, error: null });
      },
    };
    return chain;
  });
  const supabase = { from, storage: { from: vi.fn(() => ({ createSignedUploadUrl, createSignedUrl, remove })) } };
  requireUserMock.mockResolvedValue({ user: { id: options.userId ?? "user-1" }, supabase });
  return { supabase, from, remove, createSignedUploadUrl, createSignedUrl, inserts, updates, deletes };
}

const uploadInput = { title: "Evidence", type: "PDF", description: "desc", source_url: "", collection_date: "2026-07-21T00:00:00.000Z", tags: "tag", file_name: "proof.pdf", mime_type: "application/pdf", file_size: 1234 };
const finalInput = { title: "Evidence", type: "PDF", description: "desc", source_url: "", collection_date: "2026-07-21T00:00:00.000Z", tags: "tag", storage_path: "user-1/project-1/new.pdf", original_file_name: "proof.pdf", mime_type: "application/pdf", file_size: 1234 };

beforeEach(() => { vi.clearAllMocks(); });

describe("workspace server workflow security", () => {
  it("signed upload authorization rejects unauthenticated users", async () => {
    requireUserMock.mockRejectedValue(new Error("unauthenticated"));
    const { authorizeEvidenceUpload } = await import("@/app/actions");
    await expect(authorizeEvidenceUpload("project-1", uploadInput)).rejects.toThrow("unauthenticated");
  });

  it("signed upload authorization rejects a project owned by another user", async () => {
    makeSupabase({ userId: "user-1", projectOwnerId: "user-2" });
    const { authorizeEvidenceUpload } = await import("@/app/actions");
    await expect(authorizeEvidenceUpload("project-1", uploadInput)).rejects.toThrow("Project not found");
  });

  it("metadata finalization failure deletes the newly uploaded orphan object", async () => {
    const { remove } = makeSupabase({ metadataInsertError: "insert failed" });
    const { finalizeEvidenceUpload } = await import("@/app/actions");
    await expect(finalizeEvidenceUpload("project-1", finalInput)).resolves.toEqual({ error: "insert failed" });
    expect(remove).toHaveBeenCalledWith(["user-1/project-1/new.pdf"]);
  });

  it("file replacement keeps the old object if metadata update fails", async () => {
    const { remove } = makeSupabase({ metadataUpdateError: "update failed" });
    const { replaceEvidenceFile } = await import("@/app/actions");
    await expect(replaceEvidenceFile("project-1", "evidence-1", { storage_path: "user-1/project-1/new.pdf", original_file_name: "new.pdf", mime_type: "application/pdf", file_size: 100 })).resolves.toEqual({ error: "update failed" });
    expect(remove).toHaveBeenCalledWith(["user-1/project-1/new.pdf"]);
    expect(remove).not.toHaveBeenCalledWith(["user-1/project-1/old.pdf"]);
  });

  it("successful file replacement deletes the old object only after metadata succeeds", async () => {
    const { remove, updates } = makeSupabase();
    const { replaceEvidenceFile } = await import("@/app/actions");
    await expect(replaceEvidenceFile("project-1", "evidence-1", { storage_path: "user-1/project-1/new.pdf", original_file_name: "new.pdf", mime_type: "application/pdf", file_size: 100 })).resolves.toEqual({ success: "Evidence file replaced." });
    expect(updates).toHaveLength(1);
    expect(remove).toHaveBeenCalledWith(["user-1/project-1/old.pdf"]);
  });

  it("signed download rejects another user's project/evidence record", async () => {
    makeSupabase({ userId: "user-1", projectOwnerId: "user-2" });
    const { getEvidenceDownloadUrl } = await import("@/app/actions");
    await expect(getEvidenceDownloadUrl("project-1", "evidence-1")).rejects.toThrow("Project not found");
  });

  it("signed download returns only a short-lived URL for an authorized owner", async () => {
    const { createSignedUrl } = makeSupabase();
    const { getEvidenceDownloadUrl } = await import("@/app/actions");
    await expect(getEvidenceDownloadUrl("project-1", "evidence-1")).resolves.toEqual({ url: "https://signed.example/evidence?token=short" });
    expect(createSignedUrl).toHaveBeenCalledWith("user-1/project-1/old.pdf", 60);
  });

  it.each([
    ["note update", "updateNote", validNote, "research_notes"],
    ["evidence update", "updateEvidence", validEvidence, "evidence"],
    ["timeline update", "updateTimelineEvent", validEvent, "timeline_events"],
    ["task update", "updateTask", validTask, "project_tasks"],
  ])("%s rejects a valid child ID paired with a foreign project ID", async (_name, actionName, formFactory) => {
    makeSupabase({ childMissing: true });
    const actions = await import("@/app/actions");
    const action = actions[actionName as keyof typeof actions] as (projectId: string, id: string, state: { error?: string }, formData: FormData) => Promise<{ error?: string }>;
    await expect(action("foreign-project", "valid-child-id", {}, formFactory())).rejects.toThrow("Record not found");
  });

  it.each([
    ["note delete", "deleteNote"],
    ["evidence delete", "deleteEvidence"],
    ["timeline delete", "deleteTimelineEvent"],
    ["task delete", "deleteTask"],
  ])("%s enforces parent/child ownership checks", async (_name, actionName) => {
    makeSupabase({ childMissing: true });
    const actions = await import("@/app/actions");
    const action = actions[actionName as keyof typeof actions] as (projectId: string, id: string) => Promise<void>;
    await expect(action("foreign-project", "valid-child-id")).rejects.toThrow("Record not found");
  });
});
