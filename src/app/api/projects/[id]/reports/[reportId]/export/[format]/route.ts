import React from "react";
import { NextResponse } from "next/server";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { requireUser } from "@/lib/auth";
import { parseJsonDoc, safeReportFilename } from "@/lib/reports/schema";
import { standaloneHtml, tiptapToMarkdown, tiptapToPdfElements } from "@/lib/reports/render";
export const runtime = "nodejs";
const styles = StyleSheet.create({ page: { padding: 36, fontSize: 11, lineHeight: 1.4 }, title: { fontSize: 22, marginBottom: 8, fontWeight: 700 }, meta: { fontSize: 10, marginBottom: 18, color: "#475569" }, pageNo: { position: "absolute", bottom: 18, right: 36, fontSize: 9, color: "#64748b" } });
function PdfDoc({ report, content }: { report: Record<string, unknown>; content: unknown }) { return React.createElement(Document, null, React.createElement(Page, { size: "A4", style: styles.page, wrap: true }, React.createElement(Text, { style: styles.title }, String(report.title)), React.createElement(Text, { style: styles.meta }, `${String(report.type)} · ${String(report.status)} · ${String(report.updated_at ?? "")}`), React.createElement(View, null, tiptapToPdfElements(content)), React.createElement(Text, { fixed: true, render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`, style: styles.pageNo }))); }
export async function GET(request: Request, { params }: { params: Promise<{ id: string; reportId: string; format: string }> }) {
  const { id, reportId, format } = await params;
  const { supabase, user } = await requireUser();
  const { data: project } = await supabase.from("projects").select("id,owner_id").eq("id", id).single();
  if (!project || project.owner_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: report, error } = await supabase.from("reports").select("*").eq("project_id", id).eq("id", reportId).single();
  if (error || !report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const requestedVersion = new URL(request.url).searchParams.get("versionId");
  let exportReport: Record<string, unknown> = report as Record<string, unknown>;
  if (requestedVersion) {
    const { data: version, error: versionError } = await supabase.from("report_versions").select("*,report_version_references(*)").eq("project_id", id).eq("report_id", reportId).eq("id", requestedVersion).single();
    if (versionError || !version) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const appendix = (version.report_version_references ?? []).map((r: Record<string, unknown>) => `${String(r.reference_type)}: ${String(r.label_snapshot)}`).join("; ");
    exportReport = { ...version, title: version.title_snapshot, type: version.product_type_snapshot, status: version.version_status, updated_at: version.published_at ?? version.created_at, content: version.content_snapshot, appendix };
  }
  const parsed = parseJsonDoc(exportReport.content);
  if (!parsed.success) return NextResponse.json({ error: "Report content is invalid." }, { status: 422 });
  const ext = format === "md" ? "md" : format === "html" ? "html" : format === "pdf" ? "pdf" : "";
  if (!ext) return NextResponse.json({ error: "Unsupported export format." }, { status: 400 });
  const headers = { "Content-Disposition": `attachment; filename="${safeReportFilename(String(exportReport.title), ext)}"` };
  if (format === "md") return new NextResponse(tiptapToMarkdown(parsed.data, String(exportReport.title)), { headers: { ...headers, "Content-Type": "text/markdown; charset=utf-8" } });
  if (format === "html") return new NextResponse(standaloneHtml(parsed.data, { title: String(exportReport.title), type: String(exportReport.type), status: String(exportReport.status), updated_at: String(exportReport.updated_at ?? "") }), { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  try {
    const buf = await renderToBuffer(React.createElement(PdfDoc, { report: exportReport, content: parsed.data }) as React.ReactElement<React.ComponentProps<typeof Document>>);
    if (buf.length === 0 || !buf.subarray(0, 4).equals(Buffer.from("%PDF")) || !buf.includes(Buffer.from("%%EOF"))) throw new Error("invalid pdf bytes");
    return new NextResponse(new Uint8Array(buf), { headers: { ...headers, "Content-Type": "application/pdf" } });
  } catch {
    return NextResponse.json({ error: "Unable to generate PDF export." }, { status: 500 });
  }
}
