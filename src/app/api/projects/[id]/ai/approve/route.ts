import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  indicatorSchema,
  normalizeIndicatorValue,
  validateIndicator,
} from "@/lib/cti-schema";
import { reportMetaSchema, reportSchema } from "@/lib/reports/schema";
import { noteSchema } from "@/lib/workspace/schema";
import { mitreAttackIdSchema, resolveMitreSuggestionsForProject } from "@/lib/ai/mitre";
import { missingProtectedTokens, reportDraftSchema, toTiptapDoc } from "@/lib/ai/workflows";
import { reportSourceKinds, reportSourceTableMap, type ReportSourceKind } from "@/lib/ai/provenance";
import { buildEntityApprovalPayload } from "@/lib/ai/entity-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid = z.string().uuid();
const indicatorApprovalSchema = z
  .object({
    value: z.string().max(500),
    type: z.enum(["IP", "DOMAIN", "URL", "HASH", "EMAIL", "FILE", "REGISTRY"]),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
    source_ref: z.object({ kind: z.string().max(40), id: uuid }).strict().nullable().optional(),
  })
  .strict();
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("save_summary_note"), title: z.string().max(160), content: z.string().max(50000), sourceNoteIds: z.array(uuid).max(20) }).strict(),
  z.object({ kind: z.literal("add_indicator"), indicator: indicatorApprovalSchema }).strict(),
  z.object({ kind: z.literal("add_indicators"), indicators: z.array(indicatorApprovalSchema).max(30) }).strict(),
  z.object({ kind: z.literal("add_entity"), entityType: z.enum(["actors", "malware", "campaigns", "cves"]), name: z.string().max(180), description: z.string().max(20000).optional() }).strict(),
  z.object({ kind: z.literal("link_mitre"), parentType: z.enum(["campaigns", "malware"]), parentId: uuid, techniques: z.array(z.object({ technique_id: mitreAttackIdSchema, technique_name: z.string().max(180).optional() }).strict()).max(20) }).strict(),
  z.object({ kind: z.literal("save_report_draft"), draft: reportDraftSchema }).strict(),
  z.object({ kind: z.literal("save_translation_note"), title: z.string().max(160), translatedText: z.string().max(50000), source: z.object({ kind: z.enum(["note", "evidence"]), id: uuid }).strict() }).strict(),
]);

async function projectCtx(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from("projects").select("id,owner_id").eq("id", id).single();
  if (error || !data || data.owner_id !== user.id) throw new Error("not_found");
  return { supabase, user, projectId: id };
}

async function verifyReportDraftRefs(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], projectId: string, draft: z.infer<typeof reportDraftSchema>) {
  const grouped = new Map<ReportSourceKind, Set<string>>();
  for (const section of draft.sections) {
    for (const ref of section.source_refs) {
      if (!reportSourceKinds.includes(ref.kind)) return false;
      const set = grouped.get(ref.kind) ?? new Set<string>();
      set.add(ref.id);
      grouped.set(ref.kind, set);
    }
  }
  for (const [kind, ids] of grouped) {
    const { table } = reportSourceTableMap[kind];
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("project_id", projectId).in("id", Array.from(ids));
    if (error || count !== ids.size) return false;
  }
  return true;
}

function provenanceLabel(sourceRef?: { kind: string; id: string } | null) {
  if (!sourceRef) return "AI-reviewed approval";
  return `AI-reviewed ${sourceRef.kind}:${sourceRef.id}`;
}

async function approveIndicator(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], projectId: string, input: z.infer<typeof indicatorApprovalSchema>) {
  const normalized = normalizeIndicatorValue(input.value, input.type);
  const invalid = validateIndicator(normalized, input.type);
  if (invalid) return { value: input.value, type: input.type, status: "invalid" as const, error: invalid };
  const p = indicatorSchema.parse({ value: normalized, type: input.type, confidence: input.confidence, source: provenanceLabel(input.source_ref), tags: ["ai-generated"], first_seen: null, last_seen: null });
  const { data: dup, error: dupError } = await supabase.from("indicators").select("id").eq("project_id", projectId).eq("type", p.type).eq("value", p.value).maybeSingle();
  if (dupError) return { value: p.value, type: p.type, status: "failed" as const };
  if (dup) return { value: p.value, type: p.type, status: "existing" as const, id: dup.id };
  const { data, error } = await supabase.from("indicators").insert({ ...p, project_id: projectId }).select("id").single();
  if (error || !data) return { value: p.value, type: p.type, status: "failed" as const };
  return { value: p.value, type: p.type, status: "created" as const, id: data.id };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = schema.parse(await req.json());
    const { supabase, user } = await projectCtx(id);

    if (body.kind === "save_summary_note") {
      const p = noteSchema.parse({ title: body.title, content: body.content, tags: ["ai-generated"] });
      const { data, error } = await supabase.from("research_notes").insert({ ...p, project_id: id, author_id: user.id }).select("id").single();
      if (error || !data) return NextResponse.json({ error: "Unable to save note." }, { status: 400 });
      revalidatePath(`/projects/${id}`);
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (body.kind === "save_translation_note") {
      const table = body.source.kind === "note" ? "research_notes" : "evidence";
      const columns = body.source.kind === "note" ? "id,content" : "id,description";
      const { data: source, error: sourceError } = await supabase.from(table).select(columns).eq("project_id", id).eq("id", body.source.id).single();
      if (sourceError || !source) return NextResponse.json({ error: "Unable to save translation." }, { status: 400 });
      const sourceRow = source as { content?: unknown; description?: unknown };
      const sourceText = body.source.kind === "note" ? String(sourceRow.content ?? "") : String(sourceRow.description ?? "");
      if (missingProtectedTokens(sourceText, body.translatedText).length) return NextResponse.json({ error: "Protected values must be preserved before saving." }, { status: 400 });
      const p = noteSchema.parse({ title: body.title, content: body.translatedText, tags: ["ai-generated"] });
      const { data, error } = await supabase.from("research_notes").insert({ ...p, project_id: id, author_id: user.id }).select("id").single();
      if (error || !data) return NextResponse.json({ error: "Unable to save note." }, { status: 400 });
      revalidatePath(`/projects/${id}`);
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (body.kind === "add_indicator") {
      const result = await approveIndicator(supabase, id, body.indicator);
      if (result.status === "invalid") return NextResponse.json({ error: result.error, result }, { status: 400 });
      revalidatePath(`/projects/${id}`);
      return NextResponse.json({ ok: result.status !== "failed", result });
    }

    if (body.kind === "add_indicators") {
      const seen = new Set<string>();
      const results = [];
      for (const item of body.indicators) {
        const key = `${item.type}:${normalizeIndicatorValue(item.value, item.type)}`;
        if (seen.has(key)) {
          results.push({ value: item.value, type: item.type, status: "existing" as const, error: "Duplicate in this approval request." });
          continue;
        }
        seen.add(key);
        results.push(await approveIndicator(supabase, id, item));
      }
      revalidatePath(`/projects/${id}`);
      return NextResponse.json({ ok: true, results });
    }

    if (body.kind === "add_entity") {
      let entity;
      try {
        entity = buildEntityApprovalPayload(body.entityType, body.name, body.description ?? "");
      } catch {
        return NextResponse.json({ error: "Entity suggestion could not be validated." }, { status: 400 });
      }
      const { data: dup, error: dupError } = await supabase.from(entity.table).select("id").eq("project_id", id).eq(entity.uniqueCol, entity.uniqueValue).maybeSingle();
      if (dupError) return NextResponse.json({ error: "Unable to save entity." }, { status: 400 });
      if (dup) return NextResponse.json({ ok: true, id: dup.id, duplicate: true });
      const { data, error } = await supabase.from(entity.table).insert({ ...entity.payload, project_id: id }).select("id").single();
      if (error || !data) return NextResponse.json({ error: "Unable to save entity." }, { status: 400 });
      revalidatePath(`/projects/${id}`);
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (body.kind === "link_mitre") {
      const table = body.parentType === "campaigns" ? "campaign_mitre_techniques" : "malware_mitre_techniques";
      const parentTable = body.parentType === "campaigns" ? "campaigns" : "malware";
      const parentCol = body.parentType === "campaigns" ? "campaign_id" : "malware_id";
      const { data: parent, error: parentError } = await supabase.from(parentTable).select("id").eq("project_id", id).eq("id", body.parentId).single();
      if (parentError || !parent) return NextResponse.json({ error: "Unable to link MITRE techniques." }, { status: 400 });
      const normalizedIds = Array.from(new Set(body.techniques.map((t) => t.technique_id)));
      const { data: projectRows, error: mitreError } = await supabase.from("mitre_techniques").select("id,project_id,technique_id,technique_name").eq("project_id", id).in("technique_id", normalizedIds);
      const { data: existing, error: existingError } = await supabase.from(table).select("mitre_technique_id").eq("project_id", id).eq(parentCol, body.parentId);
      if (mitreError || existingError) return NextResponse.json({ error: "Unable to link MITRE techniques." }, { status: 400 });
      const results = resolveMitreSuggestionsForProject({ suggestions: body.techniques, projectId: id, projectMitreRows: (projectRows ?? []).map((r) => ({ ...r, name: r.technique_name })), existingLinks: existing ?? [] });
      const rows = results.filter((r) => r.status === "linked" && r.mitre_technique_id).map((r) => ({ project_id: id, [parentCol]: body.parentId, mitre_technique_id: r.mitre_technique_id! }));
      if (rows.length) {
        const { error } = await supabase.from(table).upsert(rows, { onConflict: `project_id,${parentCol},mitre_technique_id` });
        if (error) return NextResponse.json({ error: "Unable to link MITRE techniques." }, { status: 400 });
      }
      revalidatePath(`/projects/${id}`);
      return NextResponse.json({ ok: true, linked: results.filter((r) => r.status === "linked"), alreadyLinked: results.filter((r) => r.status === "already_linked"), rejected: results.filter((r) => r.status === "unavailable" || r.status === "invalid") });
    }

    try {
      if (!(await verifyReportDraftRefs(supabase, id, body.draft))) return NextResponse.json({ error: "Report draft contains unavailable source references." }, { status: 400 });
      const doc = toTiptapDoc(body.draft);
      const report = reportSchema.parse({ title: body.draft.title, type: body.draft.report_type_suggestion, status: "DRAFT", content: doc });
      reportMetaSchema.parse(report);
      const { data, error } = await supabase.from("reports").insert({ ...report, project_id: id, author_id: user.id }).select("id").single();
      if (error || !data) return NextResponse.json({ error: "Unable to save report draft." }, { status: 400 });
      revalidatePath(`/projects/${id}`);
      return NextResponse.json({ ok: true, id: data.id });
    } catch {
      return NextResponse.json({ error: "Report draft is incomplete and cannot be saved." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Approval could not be completed." }, { status: 400 });
  }
}
