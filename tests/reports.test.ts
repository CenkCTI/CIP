import React from "react";
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import {
  emptyTiptapDoc,
  parseJsonDoc,
  safeReportFilename,
  tiptapDocSchema,
} from "@/lib/reports/schema";
import {
  standaloneHtml,
  tiptapToMarkdown,
  tiptapToPdfElements,
} from "@/lib/reports/render";

const doc = {
  type: "doc",
  attrs: { version: 1 },
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Findings" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "safe", marks: [{ type: "bold" }] },
        { type: "hardBreak" },
        {
          type: "text",
          text: "link",
          marks: [{ type: "link", attrs: { href: "https://example.com/a" } }],
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "bullet" }] },
          ],
        },
      ],
    },
    {
      type: "orderedList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "number" }] },
          ],
        },
      ],
    },
    {
      type: "blockquote",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "quoted" }] },
      ],
    },
    { type: "codeBlock", content: [{ type: "text", text: "const a = 1;" }] },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableHeader",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Key" }] },
              ],
            },
            {
              type: "tableHeader",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Value" }],
                },
              ],
            },
          ],
        },
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "IOC" }] },
              ],
            },
            {
              type: "tableCell",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "1.2.3.4" }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("report TipTap validation and exports", () => {
  it("requires versioned TipTap doc and enforces complexity limits", () => {
    expect(tiptapDocSchema.safeParse(emptyTiptapDoc).success).toBe(true);
    expect(
      parseJsonDoc({ type: "doc", attrs: { version: 2 }, content: [] }).success,
    ).toBe(false);
    expect(
      parseJsonDoc({ type: "paragraph", attrs: { version: 1 } }).success,
    ).toBe(false);
    expect(
      parseJsonDoc({
        type: "doc",
        attrs: { version: 1 },
        content: [{ type: "image", attrs: { src: "x" } }],
      }).success,
    ).toBe(false);
    const deep = Array.from({ length: 35 }).reduce(
      (acc) => ({ type: "blockquote", content: [acc] }),
      { type: "paragraph" },
    );
    expect(
      parseJsonDoc({ type: "doc", attrs: { version: 1 }, content: [deep] })
        .success,
    ).toBe(false);
  });

  it("accepts normal safe URLs and rejects unsafe canonical link marks", () => {
    for (const href of ["https://example.com", "https://example.com/path"]) {
      expect(
        parseJsonDoc({
          type: "doc",
          attrs: { version: 1 },
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "x",
                  marks: [{ type: "link", attrs: { href } }],
                },
              ],
            },
          ],
        }).success,
      ).toBe(true);
    }
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,x",
      "/relative",
      "not a url",
      "https://user:pass@example.com",
      " https://example.com",
    ]) {
      expect(
        parseJsonDoc({
          type: "doc",
          attrs: { version: 1 },
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "x",
                  marks: [{ type: "link", attrs: { href } }],
                },
              ],
            },
          ],
        }).success,
      ).toBe(false);
    }
    expect(
      parseJsonDoc({
        type: "doc",
        attrs: { version: 1 },
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "x",
                marks: [
                  {
                    type: "link",
                    attrs: { href: "https://example.com", onclick: "x" },
                  },
                ],
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("renders sanitized standalone HTML", () => {
    const html = standaloneHtml(doc, {
      title: "Ops <Report>",
      type: "CTI",
      status: "FINAL",
    });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Ops &lt;Report&gt;");
    expect(html).toContain('<a href="https://example.com/a"');
    expect(html).not.toContain("javascript:alert");
    expect(html).not.toContain("<script");
  });

  it("renders Markdown headings lists tables code and safe filenames", () => {
    const md = tiptapToMarkdown(doc, "Ops");
    expect(md).toContain("## Findings");
    expect(md).toContain("**safe**");
    expect(md).toContain("- bullet");
    expect(md).toContain("1. number");
    expect(md).toContain("```\nconst a = 1;");
    expect(md).toContain("| Key | Value |");
    expect(md).toContain("| --- | --- |");
    expect(safeReportFilename("../Ops Report:*?", "pdf")).toBe(
      "Ops-Report.pdf",
    );
  });

  it("renders non-empty PDF bytes with signature and EOF", async () => {
    const buf = await renderToBuffer(
      React.createElement(
        Document,
        null,
        React.createElement(Page, null, tiptapToPdfElements(doc)),
      ),
    );
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    expect(buf.includes(Buffer.from("%%EOF"))).toBe(true);
  });
});
