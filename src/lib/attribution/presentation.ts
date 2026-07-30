export type AttributionRow = Record<string, unknown>;
export type EvidencePresentation = {
  type: string;
  label: string;
  href: string;
};
const s = (value: unknown) => String(value ?? "");
const definitions = [
  ["source_id", "Source", "sources"],
  ["evidence_id", "Evidence", "evidence"],
  ["timeline_event_id", "Timeline event", "timeline_event"],
  [
    "infrastructure_cluster_id",
    "Infrastructure Cluster",
    "infrastructure_cluster",
  ],
  ["indicator_id", "Indicator", "indicator"],
  ["enrichment_result_id", "Enrichment result", "enrichment_result"],
  ["malware_id", "Malware", "malware"],
  ["mitre_technique_id", "MITRE Technique", "mitre_technique"],
] as const;
export function evidencePresentation(
  item: AttributionRow,
  projectId: string,
  lookups: Record<string, AttributionRow[]>,
): EvidencePresentation {
  const definition = definitions.find(([column]) => Boolean(item[column]));
  if (!definition)
    return {
      type: "Unknown",
      label: "Unavailable record",
      href: `/projects/${projectId}`,
    };
  const [, type, key] = definition,
    id = s(item[definition[0]]);
  const record = (lookups[key] ?? []).find((row) => s(row.id) === id) ?? {};
  switch (key) {
    case "sources":
      return {
        type,
        label: s(record.title) || "Unavailable Source",
        href: `/projects/${projectId}/sources/${id}`,
      };
    case "evidence":
      return {
        type,
        label: s(record.title) || "Unavailable Evidence",
        href: `/projects/${projectId}?tab=evidence#evidence-${id}`,
      };
    case "timeline_event":
      return {
        type,
        label: `${s(record.event_date).slice(0, 10)} — ${s(record.event_name)}`,
        href: `/projects/${projectId}/timeline/${id}`,
      };
    case "infrastructure_cluster":
      return {
        type,
        label: s(record.name) || "Unavailable Infrastructure Cluster",
        href: `/projects/${projectId}/infrastructure/${id}`,
      };
    case "indicator":
      return {
        type,
        label: `${s(record.value)} (${s(record.type)})`,
        href: `/projects/${projectId}/indicators/${id}`,
      };
    case "enrichment_result": {
      const indicatorId = s(record.indicator_id);
      return {
        type,
        label: `${s(record.provider_key) || s(record.category)} · ${s(record.category)} · ${s(record.queried_at).slice(0, 10)}`,
        href: `/projects/${projectId}/indicators/${indicatorId}#enrichment-history`,
      };
    }
    case "malware":
      return {
        type,
        label: s(record.name) || "Unavailable Malware",
        href: `/projects/${projectId}/malware/${id}`,
      };
    default:
      return {
        type,
        label: `${s(record.technique_id)} — ${s(record.technique_name)}`,
        href: `/projects/${projectId}/mitre/${id}`,
      };
  }
}
export function hypothesisSubjectName(hypothesis: AttributionRow) {
  const actor = hypothesis.threat_actors as AttributionRow | null;
  return hypothesis.subject_kind === "EXISTING_THREAT_ACTOR"
    ? s(actor?.name) || "Unavailable Threat Actor"
    : s(hypothesis.subject_label);
}
