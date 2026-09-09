import { describe, expect, it } from "vitest";
import { emptyTiptapDoc } from "@/lib/reports/schema";
import {
  folderNameSchema,
  noteDraftSchema,
  plainTextFromTiptap,
  reportDraftAutosaveSchema,
  workspaceMutationSchema,
} from "@/lib/workspace-v2/schema";

describe("Notes and Reports workspace v2 contracts", () => {
  it("accepts normal folder names and rejects path/control characters", () => {
    expect(folderNameSchema.parse("  Poland Energy  ")).toBe("Poland Energy");
    expect(folderNameSchema.safeParse("Poland/Energy").success).toBe(false);
    expect(folderNameSchema.safeParse("Poland\\Energy").success).toBe(false);
    expect(folderNameSchema.safeParse("bad\u0000name").success).toBe(false);
  });

  it("validates optimistic note drafts", () => {
    expect(
      noteDraftSchema.safeParse({
        baseRevision: 7,
        title: "DynoWiper notes",
        content: emptyTiptapDoc,
      }).success,
    ).toBe(true);
    expect(
      noteDraftSchema.safeParse({
        baseRevision: -1,
        title: "DynoWiper notes",
        content: emptyTiptapDoc,
      }).success,
    ).toBe(false);
  });

  it("validates report autosave without changing lifecycle/version semantics", () => {
    expect(
      reportDraftAutosaveSchema.safeParse({
        baseRevision: 3,
        title: "Poland threat assessment",
        type: "CTI",
        status: "DRAFT",
        content: emptyTiptapDoc,
      }).success,
    ).toBe(true);
    expect(
      reportDraftAutosaveSchema.safeParse({
        baseRevision: 3,
        title: "Poland threat assessment",
        type: "CTI",
        status: "PUBLISHED",
        content: emptyTiptapDoc,
      }).success,
    ).toBe(false);
  });

  it("derives compatibility plain text from structured note content", () => {
    const doc = {
      type: "doc",
      attrs: { version: 1 },
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Finding" }] },
        { type: "paragraph", content: [{ type: "text", text: "Observed activity" }] },
        { type: "bulletList", content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "IOC one" }] }] },
        ] },
      ],
    };
    expect(plainTextFromTiptap(doc)).toBe("Finding\nObserved activity\nIOC one");
  });

  it("allows nested workspace mutations for notes and reports", () => {
    const folderId = "11111111-1111-4111-8111-111111111111";
    expect(workspaceMutationSchema.safeParse({ action: "create_note", folderId }).success).toBe(true);
    expect(workspaceMutationSchema.safeParse({ action: "create_report", folderId }).success).toBe(true);
    expect(
      workspaceMutationSchema.safeParse({
        action: "create_folder",
        kind: "REPORTS",
        name: "Operational",
        parentId: folderId,
      }).success,
    ).toBe(true);
  });
});
