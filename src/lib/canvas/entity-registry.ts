import { z } from "zod";
import { inventoryDetailUrl } from "@/lib/fusion/types";

/** Canonical record families already exposed by the security-invoker Fusion Inventory. */
export const canvasEntityTypes = [
  "SOURCE", "SOURCE_ASSET", "SOURCE_NOTE", "ANNOTATION", "SOURCE_CLAIM",
  "ATTRIBUTION_CLAIM", "RESEARCH_NOTE", "EVIDENCE", "TIMELINE_EVENT",
  "ACTOR", "CAMPAIGN", "INDICATOR", "MALWARE", "CVE", "MITRE",
  "COUNTRY_NOTE", "INFORMATION_GAP", "COLLECTION_REQUIREMENT",
] as const;

export const canvasEntityTypeSchema = z.enum(canvasEntityTypes);
export type CanvasEntityType = z.infer<typeof canvasEntityTypeSchema>;

const names: Record<CanvasEntityType, string> = {
  SOURCE: "Source",
  SOURCE_ASSET: "Source file",
  SOURCE_NOTE: "Source note",
  ANNOTATION: "Source annotation",
  SOURCE_CLAIM: "Source-reported claim",
  ATTRIBUTION_CLAIM: "Attribution claim",
  RESEARCH_NOTE: "Research note",
  EVIDENCE: "Evidence",
  TIMELINE_EVENT: "Timeline event",
  ACTOR: "Threat actor",
  CAMPAIGN: "Campaign",
  INDICATOR: "Indicator",
  MALWARE: "Malware",
  CVE: "CVE",
  MITRE: "MITRE technique",
  COUNTRY_NOTE: "Country note",
  INFORMATION_GAP: "Information gap",
  COLLECTION_REQUIREMENT: "Collection requirement",
};

export const canvasEntityLabel = (type: CanvasEntityType): string => names[type];

export type CanvasEntityRef = {
  recordType: CanvasEntityType;
  recordId: string;
};

export type CanvasEntitySummary = CanvasEntityRef & {
  title: string;
  summary: string;
  originKind: string;
  updatedAt: string | null;
  href: string;
};

export function canvasEntityKey(ref: CanvasEntityRef): string {
  return `${ref.recordType}:${ref.recordId}`;
}

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Convert a live, owner-scoped Fusion row to a safe, bounded card view.
 * Never persist or return arbitrary source metadata, rich HTML or signed asset URLs.
 */
export function canvasEntityFromFusionRow(
  projectId: string,
  raw: Record<string, unknown>,
): CanvasEntitySummary | null {
  const type = canvasEntityTypeSchema.safeParse(raw.record_type);
  const id = z.string().uuid().safeParse(raw.record_id);
  if (!type.success || !id.success) return null;
  const sourceIds = Array.isArray(raw.source_ids)
    ? raw.source_ids.filter((value): value is string => z.string().uuid().safeParse(value).success)
    : [];
  const metadata = raw.metadata && typeof raw.metadata === "object" &&
    !Array.isArray(raw.metadata) ? raw.metadata as Record<string, unknown> : {};
  const safeMetadata = { countryId: typeof metadata.countryId === "string" ? metadata.countryId : null };
  const href = inventoryDetailUrl(projectId, {
    record_type: type.data,
    record_id: id.data,
    source_ids: sourceIds,
    metadata: safeMetadata,
  });
  const preview = clean(raw.summary, 440) || clean(raw.preview_text, 440);
  return {
    recordType: type.data, recordId: id.data,
    title: clean(raw.title, 240) || `${names[type.data]} (untitled)`,
    summary: preview,
    originKind: clean(raw.origin_kind, 64),
    updatedAt: typeof raw.updated_at === "string" ? raw.updated_at : null,
    href,
  };
}
