import { z } from "zod";

export const mitreAttackIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^T\d{4}(?:\.\d{3})?$/, "Use a valid MITRE ATT&CK technique ID such as T1059 or T1059.001.");

export type MitreSuggestionInput = {
  technique_id: string;
  technique_name?: string;
};
export type ProjectMitreRow = {
  id: string;
  project_id: string;
  technique_id: string;
  name?: string | null;
};
export type ExistingMitreLink = {
  mitre_technique_id: string;
};
export type MitreResolution = {
  technique_id: string;
  technique_name?: string;
  status: "linked" | "already_linked" | "unavailable" | "invalid";
  mitre_technique_id?: string;
  reason?: string;
};

export function normalizeMitreAttackId(value: string) {
  return mitreAttackIdSchema.parse(value);
}

export function resolveMitreSuggestionsForProject(params: {
  suggestions: MitreSuggestionInput[];
  projectId: string;
  projectMitreRows: ProjectMitreRow[];
  existingLinks: ExistingMitreLink[];
}): MitreResolution[] {
  const byAttackId = new Map(
    params.projectMitreRows
      .filter((row) => row.project_id === params.projectId)
      .map((row) => [normalizeMitreAttackId(row.technique_id), row]),
  );
  const linked = new Set(params.existingLinks.map((link) => link.mitre_technique_id));
  const seen = new Set<string>();

  return params.suggestions.map((suggestion) => {
    const parsed = mitreAttackIdSchema.safeParse(suggestion.technique_id);
    if (!parsed.success) {
      return {
        technique_id: String(suggestion.technique_id ?? ""),
        technique_name: suggestion.technique_name,
        status: "invalid",
        reason: "Invalid MITRE ATT&CK technique ID.",
      } satisfies MitreResolution;
    }

    const attackId = parsed.data;
    if (seen.has(attackId)) {
      return {
        technique_id: attackId,
        technique_name: suggestion.technique_name,
        status: "already_linked",
        reason: "Duplicate suggestion in this approval request.",
      } satisfies MitreResolution;
    }
    seen.add(attackId);

    const row = byAttackId.get(attackId);
    if (!row) {
      return {
        technique_id: attackId,
        technique_name: suggestion.technique_name,
        status: "unavailable",
        reason: "Technique ID is not present in this project.",
      } satisfies MitreResolution;
    }
    if (linked.has(row.id)) {
      return {
        technique_id: attackId,
        technique_name: row.name ?? suggestion.technique_name,
        mitre_technique_id: row.id,
        status: "already_linked",
        reason: "Technique is already linked to this record.",
      } satisfies MitreResolution;
    }
    linked.add(row.id);
    return {
      technique_id: attackId,
      technique_name: row.name ?? suggestion.technique_name,
      mitre_technique_id: row.id,
      status: "linked",
    } satisfies MitreResolution;
  });
}
