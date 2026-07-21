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

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const EVIDENCE_ID = "55555555-5555-4555-8555-555555555555";

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
const validTask = () => fd({ task_name: "Updated task", description: "desc", status: "IN_PROGRESS", priority: "HIGH", assigned_user_id: USER_ID, deadline: "2026-07-22T00:00:00.000Z" });

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
          return { data: { id: state.filters.id, owner_id: options.projectOwnerId ?? options.userId ?? USER_ID }, error: null };
        }
        if (state.op === "select" && table === "evidence" && !options.childMissing) return { data: { id: state.filters.id, project_id: state.filters.project_id, storage_path: `${USER_ID}/${PROJECT_ID}/old.pdf`, source_url: null }, error: null };
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
  requireUserMock.mockResolvedValue({ user: { id: options.userId ?? USER_ID }, supabase });
  return { supabase, from, remove, createSignedUploadUrl, createSignedUrl, inserts, updates, deletes };
}

const uploadInput = { title: "Evidence", type: "PDF", description: "desc", source_url: "", collection_date: "2026-07-21T00:00:00.000Z", tags: "tag", file_name: "proof.pdf", mime_type: "application/pdf", file_size: 1234 };
const finalInput = { title: "Evidence", type: "PDF", description: "desc", source_url: "", collection_date: "2026-07-21T00:00:00.000Z", tags: "tag", storage_path: `${USER_ID}/${PROJECT_ID}/new.pdf`, original_file_name: "proof.pdf", mime_type: "application/pdf", file_size: 1234 };

beforeEach(() => { vi.clearAllMocks(); });

describe("workspace server workflow security", () => {
  it("signed upload authorization rejects unauthenticated users", async () => {
    requireUserMock.mockRejectedValue(new Error("unauthenticated"));
    const { authorizeEvidenceUpload } = await import("@/app/actions");
    await expect(authorizeEvidenceUpload(PROJECT_ID, uploadInput)).rejects.toThrow("unauthenticated");
  });

  it("signed upload authorization rejects a project owned by another user", async () => {
    makeSupabase({ userId: USER_ID, projectOwnerId: OTHER_USER_ID });
    const { authorizeEvidenceUpload } = await import("@/app/actions");
    await expect(authorizeEvidenceUpload(PROJECT_ID, uploadInput)).rejects.toThrow("Project not found");
  });

  it("valid PNG evidence creation with optional fields blank does not send empty strings to UUID columns", async () => {
    const { inserts } = makeSupabase();
    const { finalizeEvidenceUpload } = await import("@/app/actions");
    await expect(finalizeEvidenceUpload(PROJECT_ID, { ...finalInput, type: "SCREENSHOT", source_url: "", original_file_name: "proof.png", mime_type: "image/png", storage_path: `${USER_ID}/${PROJECT_ID}/new.png` })).resolves.toEqual({ success: "Evidence saved." });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ project_id: PROJECT_ID, collected_by: USER_ID, source_url: null });
    expect(inserts[0]).not.toHaveProperty("id");
    expect(JSON.stringify(inserts[0])).not.toContain('""');
  });

  it("missing required project UUID fails before signed upload authorization", async () => {
    makeSupabase();
    const { authorizeEvidenceUpload } = await import("@/app/actions");
    await expect(authorizeEvidenceUpload("", uploadInput)).resolves.toEqual({ error: "Project is required." });
    expect(requireUserMock).not.toHaveBeenCalled();
  });

  it("metadata finalization failure deletes the newly uploaded orphan object", async () => {
    const { remove } = makeSupabase({ metadataInsertError: "insert failed" });
    const { finalizeEvidenceUpload } = await import("@/app/actions");
    await expect(finalizeEvidenceUpload(PROJECT_ID, finalInput)).resolves.toEqual({ error: "insert failed" });
    expect(remove).toHaveBeenCalledWith([`${USER_ID}/${PROJECT_ID}/new.pdf`]);
  });

  it("file replacement keeps the old object if metadata update fails", async () => {
    const { remove } = makeSupabase({ metadataUpdateError: "update failed" });
    const { replaceEvidenceFile } = await import("@/app/actions");
    await expect(replaceEvidenceFile(PROJECT_ID, EVIDENCE_ID, { storage_path: `${USER_ID}/${PROJECT_ID}/new.pdf`, original_file_name: "new.pdf", mime_type: "application/pdf", file_size: 100 })).resolves.toEqual({ error: "update failed" });
    expect(remove).toHaveBeenCalledWith([`${USER_ID}/${PROJECT_ID}/new.pdf`]);
    expect(remove).not.toHaveBeenCalledWith([`${USER_ID}/${PROJECT_ID}/old.pdf`]);
  });

  it("successful file replacement deletes the old object only after metadata succeeds", async () => {
    const { remove, updates } = makeSupabase();
    const { replaceEvidenceFile } = await import("@/app/actions");
    await expect(replaceEvidenceFile(PROJECT_ID, EVIDENCE_ID, { storage_path: `${USER_ID}/${PROJECT_ID}/new.pdf`, original_file_name: "new.pdf", mime_type: "application/pdf", file_size: 100 })).resolves.toEqual({ success: "Evidence file replaced." });
    expect(updates).toHaveLength(1);
    expect(remove).toHaveBeenCalledWith([`${USER_ID}/${PROJECT_ID}/old.pdf`]);
  });

  it("signed download rejects another user's project/evidence record", async () => {
    makeSupabase({ userId: USER_ID, projectOwnerId: OTHER_USER_ID });
    const { getEvidenceDownloadUrl } = await import("@/app/actions");
    await expect(getEvidenceDownloadUrl(PROJECT_ID, EVIDENCE_ID)).rejects.toThrow("Project not found");
  });

  it("signed download returns only a short-lived URL for an authorized owner", async () => {
    const { createSignedUrl } = makeSupabase();
    const { getEvidenceDownloadUrl } = await import("@/app/actions");
    await expect(getEvidenceDownloadUrl(PROJECT_ID, EVIDENCE_ID)).resolves.toEqual({ url: "https://signed.example/evidence?token=short" });
    expect(createSignedUrl).toHaveBeenCalledWith(`${USER_ID}/${PROJECT_ID}/old.pdf`, 60);
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
    await expect(action(OTHER_PROJECT_ID, EVIDENCE_ID, {}, formFactory())).rejects.toThrow("Record not found");
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
    await expect(action(OTHER_PROJECT_ID, EVIDENCE_ID)).rejects.toThrow("Record not found");
  });
});
