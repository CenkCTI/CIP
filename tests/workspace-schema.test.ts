import { describe, expect, it } from "vitest";
import { buildEvidencePath, evidenceFinalizeSchema, evidenceUrlOnlySchema, optionalUuidSchema, taskSchema, timelineSchema, validateUpload, isEvidencePathScoped } from "@/lib/workspace/schema";

describe("workspace schema", () => {
  it("constructs scoped evidence paths with sanitized file names", () => {
    expect(buildEvidencePath("user-1", "project-1", "bad name!!.pdf", "uuid-1")).toBe("user-1/project-1/uuid-1-bad-name.pdf");
  });
  it("rejects cross-project evidence paths", () => {
    expect(isEvidencePathScoped("user-1/project-1/uuid-file.pdf", "user-1", "project-1")).toBe(true);
    expect(isEvidencePathScoped("user-1/project-2/uuid-file.pdf", "user-1", "project-1")).toBe(false);
    expect(isEvidencePathScoped("user-2/project-1/uuid-file.pdf", "user-1", "project-1")).toBe(false);
  });
  it("validates extension, MIME, and size for uploads", () => {
    expect(validateUpload({ name: "capture.exe", type: "application/octet-stream", size: 10 })).toMatch(/extension/i);
    expect(validateUpload({ name: "capture.pdf", type: "text/plain", size: 10 })).toMatch(/MIME/);
    expect(validateUpload({ name: "capture.pdf", type: "application/pdf", size: 21 * 1024 * 1024 })).toMatch(/20 MB/);
    expect(validateUpload({ name: "capture.pdf", type: "application/pdf", size: 10 })).toBeNull();
  });
  it("requires http evidence URLs for ARTICLE/TWEET", () => {
    expect(evidenceUrlOnlySchema.safeParse({ title: "x", type: "ARTICLE", source_url: "ftp://bad", description: "", collection_date: "2026-07-21T00:00:00.000Z", tags: [] }).success).toBe(false);
    expect(evidenceUrlOnlySchema.safeParse({ title: "x", type: "ARTICLE", source_url: "https://example.com", description: "", collection_date: "2026-07-21T00:00:00.000Z", tags: [] }).success).toBe(true);
  });
  it("normalizes optional UUID form blanks to null", () => {
    expect(optionalUuidSchema.parse("")).toBeNull();
    expect(timelineSchema.parse({ event_name: "Observed", event_date: "2026-07-21T00:00:00.000Z", description: "", related_entity_type: "", related_entity_id: "" }).related_entity_id).toBeNull();
    expect(taskSchema.parse({ task_name: "Triage", description: "", status: "TODO", priority: "MEDIUM", assigned_user_id: "" }).assigned_user_id).toBeNull();
  });
  it("accepts valid PNG evidence creation metadata with blank optional URL", () => {
    const parsed = evidenceFinalizeSchema.parse({ title: "PNG proof", type: "SCREENSHOT", description: "", source_url: "", collection_date: "2026-07-21T00:00:00.000Z", tags: "", storage_path: "user/project/file.png", original_file_name: "proof.png", mime_type: "image/png", file_size: 128 });
    expect(parsed.source_url).toBeNull();
    expect(parsed.source_url).not.toBe("");
  });
  it("validates task status changes", () => {
    expect(taskSchema.safeParse({ task_name: "Triage", description: "", status: "IN_PROGRESS", priority: "HIGH" }).success).toBe(true);
    expect(taskSchema.safeParse({ task_name: "Triage", description: "", status: "BLOCKED", priority: "HIGH" }).success).toBe(false);
  });
});
