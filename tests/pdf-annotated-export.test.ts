import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

import {
  burnAnnotationsIntoPdf,
  mergePdfBytes,
  orderAnnotations,
} from "@/lib/collection/pdf-burn-in";

describe("deterministic annotated PDF helpers", () => {
  it("burns PDF-space annotations without mutating the immutable source bytes", async () => {
    const source = await PDFDocument.create();
    const page = source.addPage([612, 792]);
    const font = await source.embedFont(StandardFonts.Helvetica);
    page.drawText("APT28 test source", { x: 72, y: 700, size: 12, font });
    const original = new Uint8Array(await source.save());
    const immutableSnapshot = original.slice();

    const annotated = await burnAnnotationsIntoPdf(
      original,
      [
        {
          id: "a",
          annotation_type: "HIGHLIGHT",
          geometry_version: 2,
          comment: "note",
          created_at: "2026-01-01",
        },
      ],
      [
        {
          id: "f",
          annotation_id: "a",
          page_number: 1,
          quads: [{ x1: 70, y1: 715, x2: 190, y2: 715, x3: 190, y3: 695, x4: 70, y4: 695 }],
        },
      ],
    );

    expect(original).toEqual(immutableSnapshot);
    expect(annotated).not.toEqual(original);
    expect((await PDFDocument.load(annotated)).getPageCount()).toBe(1);
  });

  it("orders annotations by source page, top-to-bottom and left-to-right", () => {
    const annotations = [
      { id: "right", created_at: "2026-01-01T00:00:00Z" },
      { id: "page-two", created_at: "2026-01-01T00:00:00Z" },
      { id: "left", created_at: "2026-01-01T00:00:00Z" },
      { id: "lower", created_at: "2026-01-01T00:00:00Z" },
    ];
    const fragments = [
      { annotation_id: "right", page_number: 1, quads: [{ x1: 300, y1: 700, x2: 350, y2: 700, x3: 350, y3: 680, x4: 300, y4: 680 }] },
      { annotation_id: "page-two", page_number: 2, quads: [{ x1: 10, y1: 750, x2: 50, y2: 750, x3: 50, y3: 730, x4: 10, y4: 730 }] },
      { annotation_id: "left", page_number: 1, quads: [{ x1: 100, y1: 700, x2: 150, y2: 700, x3: 150, y3: 680, x4: 100, y4: 680 }] },
      { annotation_id: "lower", page_number: 1, quads: [{ x1: 50, y1: 500, x2: 100, y2: 500, x3: 100, y3: 480, x4: 50, y4: 480 }] },
    ];

    expect(orderAnnotations(annotations, fragments).map((annotation) => annotation.id)).toEqual([
      "left",
      "right",
      "lower",
      "page-two",
    ]);
  });

  it("merges front matter and source into one real PDF", async () => {
    const front = await PDFDocument.create();
    front.addPage();
    const body = await PDFDocument.create();
    body.addPage();
    body.addPage();

    const merged = await mergePdfBytes(
      new Uint8Array(await front.save()),
      new Uint8Array(await body.save()),
    );

    expect(new TextDecoder().decode(merged.slice(0, 4))).toBe("%PDF");
    expect((await PDFDocument.load(merged)).getPageCount()).toBe(3);
  });
});
