import { describe, expect, it } from "vitest";

import {
  collectionRequirementSchema,
  sourceAnnotationCreateSchema,
  sourceAnnotationCreateV2Schema,
  sourceFileDraftSchema,
  sourceUrlCreateSchema,
} from "@/lib/collection/schema";

const gap = "11111111-1111-4111-8111-111111111111";
const req = "22222222-2222-4222-8222-222222222222";
const source = "33333333-3333-4333-8333-333333333333";
const asset = "44444444-4444-4444-8444-444444444444";

describe("Investigation Collection Stage 2 schemas", () => {
  it("accepts a concise analyst-directed collection requirement", () => {
    const parsed = collectionRequirementSchema.safeParse({
      requirement:
        "APT28 attribution değerlendirmesinin dayandığı birincil resmi belgeleri topla.",
      rationale: "IG-01 için attribution basis gerekli.",
      priority: "HIGH",
      gap_ids: [gap],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty collection requirement", () => {
    const parsed = collectionRequirementSchema.safeParse({
      requirement: " ",
      rationale: "",
      priority: "MEDIUM",
      gap_ids: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a collection rationale for a URL Source", () => {
    const parsed = sourceUrlCreateSchema.safeParse({
      title: "APT28 report",
      source_type: "TECHNICAL_REPORT",
      publisher: "Example",
      url: "https://example.test/report",
      published_at: "",
      collection_rationale: "",
      description: "",
      gap_ids: [gap],
      requirement_ids: [req],
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a hashed 50 MB-or-smaller file source draft", () => {
    const parsed = sourceFileDraftSchema.safeParse({
      title: "APT28 PDF",
      source_type: "VENDOR_REPORT",
      publisher: "",
      published_at: "",
      collection_rationale: "TTP collection requirement için toplandı.",
      description: "",
      gap_ids: [gap],
      requirement_ids: [req],
      file_name: "apt28.pdf",
      mime_type: "application/pdf",
      file_size: 1024,
      sha256: "a".repeat(64),
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects oversized file sources", () => {
    const parsed = sourceFileDraftSchema.safeParse({
      title: "Oversized",
      source_type: "OTHER",
      publisher: "",
      published_at: "",
      collection_rationale: "Collection context",
      description: "",
      gap_ids: [],
      requirement_ids: [],
      file_name: "large.bin",
      mime_type: "application/octet-stream",
      file_size: 50 * 1024 * 1024 + 1,
      sha256: "b".repeat(64),
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts normalized region annotations and nullable optional text", () => {
    const parsed = sourceAnnotationCreateSchema.safeParse({
      source_id: source,
      asset_id: asset,
      annotation_type: "UNDERLINE",
      page_number: 4,
      rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.03 }],
      selected_text: null,
      comment: "Attribution claim; trace the primary source.",
      gap_ids: [gap],
      requirement_ids: [req],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts PDF-space multi-line text annotation fragments", () => {
    const parsed = sourceAnnotationCreateV2Schema.safeParse({
      source_id: source, asset_id: asset, annotation_type: "HIGHLIGHT", anchor_kind: "TEXT",
      selected_text: "APT28 targeted diplomatic organisations.", comment: "Hedefleme için ilgili pasaj.",
      fragments: [{ page_number: 7, page_width: 612, page_height: 792, page_rotation: 0,
        selected_text: "APT28 targeted diplomatic organisations.",
        quads: [
          { x1:72,y1:700,x2:260,y2:700,x3:260,y3:686,x4:72,y4:686 },
          { x1:72,y1:682,x2:190,y2:682,x3:190,y3:668,x4:72,y4:668 },
        ] }],
      gap_ids: [gap], requirement_ids: [req],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a text annotation without selected text", () => {
    const parsed = sourceAnnotationCreateV2Schema.safeParse({
      source_id: source, asset_id: asset, annotation_type: "UNDERLINE", anchor_kind: "TEXT",
      selected_text: null, comment: "No selection",
      fragments: [{ page_number:1,page_width:612,page_height:792,page_rotation:0,
        quads:[{x1:1,y1:2,x2:3,y2:2,x3:3,y3:1,x4:1,y4:1}] }],
      gap_ids: [], requirement_ids: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects non-quarter-turn PDF page rotations", () => {
    const parsed = sourceAnnotationCreateV2Schema.safeParse({
      source_id: source,
      asset_id: asset,
      annotation_type: "HIGHLIGHT",
      anchor_kind: "TEXT",
      selected_text: "APT28",
      comment: "",
      fragments: [{
        page_number: 1,
        page_width: 612,
        page_height: 792,
        page_rotation: 45,
        selected_text: "APT28",
        quads: [{ x1: 1, y1: 2, x2: 3, y2: 2, x3: 3, y3: 1, x4: 1, y4: 1 }],
      }],
      gap_ids: [],
      requirement_ids: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects more than 500 PDF quads across one logical annotation", () => {
    const quad = { x1: 1, y1: 2, x2: 3, y2: 2, x3: 3, y3: 1, x4: 1, y4: 1 };
    const parsed = sourceAnnotationCreateV2Schema.safeParse({
      source_id: source,
      asset_id: asset,
      annotation_type: "HIGHLIGHT",
      anchor_kind: "TEXT",
      selected_text: "Large selection",
      comment: "",
      fragments: [
        {
          page_number: 1,
          page_width: 612,
          page_height: 792,
          page_rotation: 0,
          selected_text: "Large selection",
          quads: Array.from({ length: 300 }, () => quad),
        },
        {
          page_number: 2,
          page_width: 612,
          page_height: 792,
          page_rotation: 0,
          selected_text: null,
          quads: Array.from({ length: 201 }, () => quad),
        },
      ],
      gap_ids: [],
      requirement_ids: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects TEXT/REGION annotation type mismatches", () => {
    const base = {
      source_id: source,
      asset_id: asset,
      comment: "",
      fragments: [{
        page_number: 1,
        page_width: 612,
        page_height: 792,
        page_rotation: 0,
        selected_text: null,
        quads: [{ x1: 1, y1: 2, x2: 3, y2: 2, x3: 3, y3: 1, x4: 1, y4: 1 }],
      }],
      gap_ids: [],
      requirement_ids: [],
    };
    expect(sourceAnnotationCreateV2Schema.safeParse({
      ...base,
      annotation_type: "REGION",
      anchor_kind: "TEXT",
      selected_text: "APT28",
    }).success).toBe(false);
    expect(sourceAnnotationCreateV2Schema.safeParse({
      ...base,
      annotation_type: "HIGHLIGHT",
      anchor_kind: "REGION",
      selected_text: null,
    }).success).toBe(false);
  });

  it("rejects annotation rectangles outside normalized page bounds", () => {
    const parsed = sourceAnnotationCreateSchema.safeParse({
      source_id: source,
      asset_id: asset,
      annotation_type: "HIGHLIGHT",
      page_number: 1,
      rects: [{ x: 0.8, y: 0.2, width: 0.3, height: 0.05 }],
      selected_text: null,
      comment: "Out of bounds",
      gap_ids: [],
      requirement_ids: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an annotation with no region, selection or comment", () => {
    const parsed = sourceAnnotationCreateSchema.safeParse({
      source_id: source,
      asset_id: asset,
      annotation_type: "REGION",
      page_number: 1,
      rects: [],
      selected_text: null,
      comment: null,
      gap_ids: [],
      requirement_ids: [],
    });
    expect(parsed.success).toBe(false);
  });
});
