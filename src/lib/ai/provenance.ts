import { z } from "zod";

export const reportSourceKinds = ["research_note", "evidence", "timeline_event", "task", "threat_actor", "campaign", "indicator", "malware", "cve", "mitre_technique"] as const;
export type ReportSourceKind = (typeof reportSourceKinds)[number];
export type ReportSourceRef = { kind: ReportSourceKind; id: string };
export const reportSourceRefSchema = z.object({ kind: z.enum(reportSourceKinds), id: z.string().uuid() }).strict();
export const reportSourceTableMap: Record<ReportSourceKind, { table: string; sourceKey: string }> = {
  research_note: { table: "research_notes", sourceKey: "research_notes" },
  evidence: { table: "evidence", sourceKey: "evidence" },
  timeline_event: { table: "timeline_events", sourceKey: "timeline_events" },
  task: { table: "project_tasks", sourceKey: "project_tasks" },
  threat_actor: { table: "threat_actors", sourceKey: "threat_actors" },
  campaign: { table: "campaigns", sourceKey: "campaigns" },
  indicator: { table: "indicators", sourceKey: "indicators" },
  malware: { table: "malware", sourceKey: "malware" },
  cve: { table: "cves", sourceKey: "cves" },
  mitre_technique: { table: "mitre_techniques", sourceKey: "mitre_techniques" },
};
export const tableToReportSourceKind: Record<string, ReportSourceKind> = Object.fromEntries(Object.entries(reportSourceTableMap).map(([kind, cfg]) => [cfg.sourceKey, kind])) as Record<string, ReportSourceKind>;

export function refKey(ref: ReportSourceRef) { return `${ref.kind}:${ref.id}`; }
export function buildAllowedReportRefs(source: Record<string, unknown>) {
  const refs: ReportSourceRef[] = [];
  for (const [sourceKey, value] of Object.entries(source)) {
    const kind = tableToReportSourceKind[sourceKey];
    if (!kind || !Array.isArray(value)) continue;
    for (const row of value) {
      const id = row && typeof row === "object" && "id" in row ? String((row as { id?: unknown }).id ?? "") : "";
      if (z.string().uuid().safeParse(id).success) refs.push({ kind, id });
    }
  }
  return refs;
}
export function validateReportDraftProvenance(draft: { sections?: { source_refs?: unknown[] }[] }, allowedRefs: ReportSourceRef[]) {
  const allowed = new Set(allowedRefs.map(refKey));
  const invalid: string[] = [];
  for (const [sectionIndex, section] of (draft.sections ?? []).entries()) {
    for (const [refIndex, raw] of (section.source_refs ?? []).entries()) {
      const parsed = reportSourceRefSchema.safeParse(raw);
      if (!parsed.success) {
        invalid.push(`sections.${sectionIndex}.source_refs.${refIndex}: unsupported or malformed source reference`);
        continue;
      }
      if (!allowed.has(refKey(parsed.data))) invalid.push(`sections.${sectionIndex}.source_refs.${refIndex}: unauthorized source reference ${refKey(parsed.data)}`);
    }
  }
  return { ok: invalid.length === 0, invalid };
}
