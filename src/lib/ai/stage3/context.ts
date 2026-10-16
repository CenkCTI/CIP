import "server-only";

import type { requireOwnedProject } from "@/lib/projects/ownership";
import type { Stage3Request } from "./schemas";
import { documentSpans, type Stage3Span } from "./provenance";
import { extractPdfPages } from "./pdf-text";

type OwnedContext = Awaited<ReturnType<typeof requireOwnedProject>>;
type DataRow = Record<string, unknown>;

export type Stage3SourceStep = "read_source" | "read_asset" | "read_annotation" | "pdf_download" | "pdf_extract" | "span_build";

export class Stage3ContextError extends Error {
  constructor(public code: "stage3_not_found" | "context_too_large" | "unsupported_asset" | "pdf_text_unavailable") {
    super(code);
  }
}
export interface Stage3AiReadContext {
  readSource(sourceId: string): Promise<DataRow>;
  readAsset(sourceId: string, assetId: string): Promise<DataRow>;
  readAnnotation(sourceId: string, assetId: string, annotationId: string): Promise<DataRow>;
  readExistingIndicators(): Promise<DataRow[]>;
  readExistingMalware(): Promise<DataRow[]>;
  readExistingCves(): Promise<DataRow[]>;
  readExistingMitre(): Promise<DataRow[]>;
  readExistingActors(): Promise<DataRow[]>;
  readExistingCampaigns(): Promise<DataRow[]>;
  readExistingSourceClaims(): Promise<DataRow[]>;
  readTimelineEvents(): Promise<DataRow[]>;
  downloadOriginalPdf(storagePath: string): Promise<ArrayBuffer>;
}

/** Only allowlisted, project-scoped SELECT and Storage download; never expose the Supabase client to the model. */
export function createStage3ReadContext(ctx: OwnedContext): Stage3AiReadContext {
  const db = ctx.supabase;
  async function one(table: "sources" | "source_assets" | "source_annotations", columns: string, filters: Record<string,string>) {
    let query = db.from(table).select(columns).eq("project_id", ctx.projectId);
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
    const { data, error } = await query.maybeSingle();
    if (error || !data) throw new Stage3ContextError("stage3_not_found");
    return data as unknown as DataRow;
  }
  async function list(table: "indicators" | "malware" | "cves" | "mitre_techniques" | "threat_actors" | "campaigns" | "source_claims" | "timeline_events", columns: string) {
    const { data, error } = await db.from(table).select(columns).eq("project_id", ctx.projectId).limit(100);
    if (error) throw new Stage3ContextError("stage3_not_found");
    return (data ?? []) as unknown as DataRow[];
  }
  return {
    readSource: (id) => one("sources", "id,title,source_type", {id}),
    readAsset: (sourceId, id) => one("source_assets", "id,source_id,asset_role,state,mime_type,original_filename,storage_path,size_bytes", { id, source_id: sourceId }),
    readAnnotation: (sourceId, assetId, id) => one("source_annotations", "id,source_id,asset_id,selected_text,page_number,anchor_kind", { id, source_id: sourceId, asset_id: assetId }),
    readExistingIndicators: () => list("indicators", "id,value,type"),
    readExistingMalware: () => list("malware", "id,name,family"),
    readExistingCves: () => list("cves", "id,cve_id,severity"),
    readExistingMitre: () => list("mitre_techniques", "id,technique_id,technique_name"),
    readExistingActors: () => list("threat_actors", "id,name"),
    readExistingCampaigns: () => list("campaigns", "id,name"),
    readExistingSourceClaims: () => list("source_claims", "id,claim_summary,claim_kind"),
    readTimelineEvents: () => list("timeline_events", "id,event_name,event_date"),
    async downloadOriginalPdf(path) {
      const { data, error } = await db.storage.from("source-assets").download(path);
      if (error || !data) throw new Stage3ContextError("stage3_not_found");
      if (data.size > 50 * 1024 * 1024) throw new Stage3ContextError("context_too_large");
      return data.arrayBuffer();
    },
  };
}

export async function loadStage3DocumentContext(
  reader: Stage3AiReadContext,
  request: Stage3Request,
  onStep?: (step: Stage3SourceStep) => void,
) {
  onStep?.("read_source");
  const source = await reader.readSource(request.sourceId);
  onStep?.("read_asset");
  const asset = await reader.readAsset(request.sourceId, request.assetId);
  if (asset.asset_role !== "ORIGINAL" || asset.state !== "READY" ||
      typeof asset.storage_path !== "string" || !asset.storage_path ||
      (String(asset.mime_type ?? "").toLowerCase() !== "application/pdf" &&
       !String(asset.original_filename ?? "").toLowerCase().endsWith(".pdf"))) {
    throw new Stage3ContextError("unsupported_asset");
  }
  if (typeof asset.size_bytes === "number" && asset.size_bytes > 50 * 1024 * 1024) {
    throw new Stage3ContextError("context_too_large");
  }
  const selection = request.context;
  let spans: Stage3Span[];
  if (selection.kind === "annotation") {
    onStep?.("read_annotation");
    const annotation = await reader.readAnnotation(request.sourceId, request.assetId, selection.annotationId);
    const text = String(annotation.selected_text ?? "").trim();
    if (!text) throw new Stage3ContextError("pdf_text_unavailable");
    if (text.length > 12_000) throw new Stage3ContextError("context_too_large");
    spans = [{
      token: "ANN_001", text, page: annotation.page_number == null ? null : Number(annotation.page_number),
      kind: "ANNOTATION", sourceId: request.sourceId, assetId: request.assetId, annotationId: selection.annotationId,
    }];
  } else {
    const selected = selection.kind === "page"
      ? [selection.page]
      : Array.from({length: selection.pageEnd - selection.pageStart + 1}, (_, i) => selection.pageStart + i);
    onStep?.("pdf_download");
    const originalPdf = await reader.downloadOriginalPdf(String(asset.storage_path));
    onStep?.("pdf_extract");
    const pages = await extractPdfPages(originalPdf, selected);
    const total = pages.reduce((count, page) => count + page.text.length, 0);
    const cap = selection.kind === "page" ? 25_000 : 60_000;
    if (total > cap) throw new Stage3ContextError("context_too_large");
    onStep?.("span_build");
    spans = documentSpans(pages, request.sourceId, request.assetId);
  }
  if (!spans.length) throw new Stage3ContextError("pdf_text_unavailable");
  return { sourceTitle: String(source.title ?? "").slice(0, 240), spans };
}
