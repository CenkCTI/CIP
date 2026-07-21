import { describe, expect, it } from "vitest";
import {
  emptyTiptapDoc,
  safeReportFilename,
  tiptapDocSchema,
} from "@/lib/reports/schema";
import { standaloneHtml, tiptapToMarkdown } from "@/lib/reports/render";

const doc = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Findings" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "safe", marks: [{ type: "bold" }] }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "bad",
          marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
        },
      ],
    },
  ],
};

describe("report TipTap validation and exports", () => {
  it("accepts the empty default TipTap document", () => {
    expect(tiptapDocSchema.safeParse(emptyTiptapDoc).success).toBe(true);
  });

  it("renders sanitized standalone HTML", () => {
    const html = standaloneHtml(doc, {
      title: "Ops <Report>",
      type: "CTI",
      status: "FINAL",
    });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Ops &lt;Report&gt;");
    expect(html).not.toContain("javascript:alert");
  });

  it("renders Markdown and safe filenames", () => {
    expect(tiptapToMarkdown(doc, "Ops")).toContain("## Findings");
    expect(tiptapToMarkdown(doc, "Ops")).toContain("**safe**");
    expect(safeReportFilename("../Ops Report:*?", "pdf")).toBe(
      "..Ops-Report.pdf",
    );
  });
});
