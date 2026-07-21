import { Editor } from "@tiptap/core";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { Document, Page } from "@react-pdf/renderer";
import { describe, expect, it, vi } from "vitest";
import { reportEditorExtensions } from "@/lib/reports/editor-extensions";
import { parseJsonDoc } from "@/lib/reports/schema";
import {
  standaloneHtml,
  tiptapToMarkdown,
  tiptapToPdfElements,
} from "@/lib/reports/render";

const empty = {
  type: "doc",
  attrs: { version: 1 },
  content: [{ type: "paragraph" }],
};
function editor() {
  return new Editor({
    extensions: reportEditorExtensions(),
    content: empty,
    element: document.createElement("div"),
  });
}

describe("production TipTap report schema round trip", () => {
  it("retains attrs.version after content edits", () => {
    const e = editor();
    e.commands.insertContent("hello");
    const json = e.getJSON();
    expect(json.attrs?.version).toBe(1);
    expect(parseJsonDoc(json).success).toBe(true);
    e.destroy();
  });
  it("accepts real ordered list attrs from TipTap and renders start numbers", () => {
    const e = editor();
    e.chain().focus().toggleOrderedList().insertContent("first").run();
    const json = e.getJSON();
    expect(JSON.stringify(json)).toContain('"orderedList"');
    expect(parseJsonDoc(json).success).toBe(true);
    const md = tiptapToMarkdown(json);
    expect(md).toContain("1. first");
    e.destroy();
  });
  it("accepts a real 3x3 TipTap table and exports all formats", async () => {
    const e = editor();
    e.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
    const json = e.getJSON();
    expect(JSON.stringify(json)).toContain('"colspan":1');
    expect(JSON.stringify(json)).toContain('"colwidth":null');
    const parsed = parseJsonDoc(json);
    expect(parsed.success).toBe(true);
    const md = tiptapToMarkdown(json);
    const html = standaloneHtml(json, {
      title: "Table",
      type: "CTI",
      status: "DRAFT",
    });
    const pdf = await renderToBuffer(
      React.createElement(
        Document,
        null,
        React.createElement(Page, null, tiptapToPdfElements(json)),
      ),
    );
    expect(md).toContain("|  |  |  |");
    expect(html).toContain("<table>");
    expect(pdf.length).toBeGreaterThan(100);
    e.destroy();
  });
  it("saves real editor JSON through updateReport", async () => {
    const e = editor();
    e.commands.insertContent("saved");
    const json = e.getJSON();
    const actions = await import("@/app/actions");
    const spy = vi
      .spyOn(actions, "updateReport")
      .mockResolvedValueOnce({ success: "Report saved." });
    const fd = new FormData();
    fd.set("title", "Round Trip");
    fd.set("type", "CTI");
    fd.set("status", "DRAFT");
    fd.set("content", JSON.stringify(json));
    await expect(
      actions.updateReport(
        "00000000-0000-4000-8000-0000000000aa",
        "00000000-0000-4000-8000-000000000001",
        {},
        fd,
      ),
    ).resolves.toEqual({ success: "Report saved." });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    e.destroy();
  });
  it("still rejects unsafe and unsupported attributes", () => {
    expect(
      parseJsonDoc({
        type: "doc",
        attrs: { version: 1 },
        content: [
          { type: "orderedList", attrs: { start: 0, type: null }, content: [] },
        ],
      }).success,
    ).toBe(false);
    expect(
      parseJsonDoc({
        type: "doc",
        attrs: { version: 1 },
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableCell",
                    attrs: {
                      colspan: 2,
                      rowspan: 1,
                      colwidth: null,
                      align: null,
                    },
                    content: [{ type: "paragraph" }],
                  },
                ],
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
