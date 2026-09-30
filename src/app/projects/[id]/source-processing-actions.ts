"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  actorSchema,
  campaignSchema,
  cveSchema,
  indicatorSchema,
  malwareSchema,
  mitreSchema,
  normalizeIndicatorValue,
} from "@/lib/cti-schema";
import { requireOwnedProject } from "@/lib/projects/ownership";
import {
  annotationProcessingStates,
  mappingOrigins,
  processingDestinations,
  type AnnotationProcessingState,
  type MappingOrigin,
  type ProcessingActionState,
  type ProcessingDestination,
} from "@/lib/processing/types";

const uuid = z.string().uuid();
const destinationSchema = z.enum(processingDestinations);
const stateSchema = z.enum(annotationProcessingStates);
const mappingOriginSchema = z.enum(mappingOrigins);
const attributionClaimSchema = z.object({
  claim_summary: z.string().trim().min(1).max(10000),
  claimed_actor_text: z.string().trim().min(1).max(500),
  canonical_threat_actor_id: z
    .preprocess((value) => (value ? String(value) : null), z.string().uuid().nullable()),
  mapping_origin: mappingOriginSchema.default("SOURCE_EXPLICIT"),
});

type Context = Awaited<ReturnType<typeof requireOwnedProject>>;
type AnnotationRow = {
  id: string;
  source_id: string;
  selected_text: string | null;
  comment: string | null;
};

const destinationMeta = {
  indicator: {
    outputType: "INDICATOR",
    table: "indicators",
    column: "indicator_id",
  },
  malware: {
    outputType: "MALWARE",
    table: "malware",
    column: "malware_id",
  },
  cve: {
    outputType: "CVE",
    table: "cves",
    column: "cve_id",
  },
  mitre: {
    outputType: "MITRE_TECHNIQUE",
    table: "mitre_techniques",
    column: "mitre_technique_id",
  },
  campaign: {
    outputType: "CAMPAIGN",
    table: "campaigns",
    column: "campaign_id",
  },
  actor: {
    outputType: "THREAT_ACTOR",
    table: "threat_actors",
    column: "threat_actor_id",
  },
  attribution_claim: {
    outputType: "ATTRIBUTION_CLAIM",
    table: "source_attribution_claims",
    column: "attribution_claim_id",
  },
} as const;

async function annotationContext(
  projectId: string,
  sourceId: string,
  annotationId: string,
) {
  const [source, annotation] = [sourceId, annotationId].map((value) =>
    uuid.safeParse(value),
  );
  if (!source.success || !annotation.success) return null;

  const context = await requireOwnedProject(projectId);
  const { data } = await context.supabase
    .from("source_annotations")
    .select("id,source_id,selected_text,comment")
    .eq("project_id", context.projectId)
    .eq("source_id", source.data)
    .eq("id", annotation.data)
    .maybeSingle();
  if (!data) return null;
  return {
    context,
    sourceId: source.data,
    annotation: data as AnnotationRow,
  };
}

function sourceRaw(annotation: AnnotationRow) {
  return String(annotation.selected_text ?? annotation.comment ?? "").trim() || null;
}

function revalidateProcessing(
  projectId: string,
  sourceId: string,
  destination?: ProcessingDestination,
  targetId?: string,
) {
  revalidatePath(`/projects/${projectId}/sources/${sourceId}`);
  revalidatePath(`/projects/${projectId}/sources`);
  revalidatePath(`/projects/${projectId}`);
  if (!destination || !targetId) return;
  const route =
    destination === "indicator"
      ? "indicators"
      : destination === "cve"
        ? "cves"
        : destination === "mitre"
          ? "mitre"
          : destination === "actor"
            ? "actors"
            : destination === "attribution_claim"
              ? null
              : destination;
  if (route) revalidatePath(`/projects/${projectId}/${route}/${targetId}`);
}

async function recordOutput(input: {
  context: Context;
  annotation: AnnotationRow;
  destination: ProcessingDestination;
  targetId: string;
  targetLabel: string;
  action: "CREATED" | "LINKED";
  normalizedValue?: string | null;
  mappingOrigin?: MappingOrigin;
}) {
  const meta = destinationMeta[input.destination];
  const row = {
    project_id: input.context.projectId,
    source_annotation_id: input.annotation.id,
    output_type: meta.outputType,
    output_action: input.action,
    mapping_origin: input.mappingOrigin ?? "SOURCE_EXPLICIT",
    target_label: input.targetLabel.slice(0, 500),
    raw_value: sourceRaw(input.annotation),
    normalized_value: input.normalizedValue?.slice(0, 20000) || null,
    [meta.column]: input.targetId,
    created_by: input.context.user.id,
  };
  const { error } = await input.context.supabase
    .from("source_annotation_outputs")
    .insert(row);
  if (error?.code === "23505") return null;
  return error;
}

async function compensateCreatedTarget(
  context: Context,
  destination: ProcessingDestination,
  targetId: string,
) {
  const meta = destinationMeta[destination];
  if (destination === "attribution_claim") {
    await context.supabase
      .from("source_attribution_claims")
      .delete()
      .eq("project_id", context.projectId)
      .eq("id", targetId);
    return;
  }
  await context.supabase
    .from(meta.table)
    .delete()
    .eq("project_id", context.projectId)
    .eq("id", targetId);
}

async function finishCreatedOutput(input: {
  context: Context;
  annotation: AnnotationRow;
  sourceId: string;
  destination: ProcessingDestination;
  targetId: string;
  targetLabel: string;
  normalizedValue?: string | null;
  mappingOrigin?: MappingOrigin;
}): Promise<ProcessingActionState> {
  const ledgerError = await recordOutput({
    context: input.context,
    annotation: input.annotation,
    destination: input.destination,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    action: "CREATED",
    normalizedValue: input.normalizedValue,
    mappingOrigin: input.mappingOrigin,
  });
  if (ledgerError) {
    await compensateCreatedTarget(input.context, input.destination, input.targetId);
    return {
      error:
        "The structured record was not retained because its annotation provenance could not be recorded.",
    };
  }
  revalidateProcessing(
    input.context.projectId,
    input.sourceId,
    input.destination,
    input.targetId,
  );
  return {
    success: "Structured record created with annotation provenance.",
    targetId: input.targetId,
    targetType: input.destination,
  };
}

export async function setAnnotationProcessingState(
  projectId: string,
  sourceId: string,
  annotationId: string,
  nextState: AnnotationProcessingState,
  note = "",
): Promise<ProcessingActionState> {
  const state = stateSchema.safeParse(nextState);
  if (!state.success) return { error: "Invalid processing state." };
  if (state.data === "IGNORED" && !note.trim()) {
    return { error: "Record why the annotation is being ignored." };
  }
  if (note.length > 4000) return { error: "Processing note is too long." };

  const resolved = await annotationContext(projectId, sourceId, annotationId);
  if (!resolved) return { error: "Source annotation not found." };

  const { error } = await resolved.context.supabase
    .from("source_annotations")
    .update({
      processing_state: state.data,
      processing_note: note.trim() || null,
      processed_at: state.data === "UNPROCESSED" ? null : new Date().toISOString(),
      processed_by:
        state.data === "UNPROCESSED" ? null : resolved.context.user.id,
    })
    .eq("project_id", resolved.context.projectId)
    .eq("source_id", resolved.sourceId)
    .eq("id", resolved.annotation.id);
  if (error) return { error: "Unable to update annotation processing state." };

  revalidateProcessing(resolved.context.projectId, resolved.sourceId);
  return {
    success:
      state.data === "UNPROCESSED"
        ? "Annotation reopened for processing."
        : state.data === "IGNORED"
          ? "Annotation marked ignored."
          : "Annotation marked processed.",
  };
}

export async function createAnnotationOutput(
  projectId: string,
  sourceId: string,
  annotationId: string,
  destinationValue: ProcessingDestination,
  formData: FormData,
): Promise<ProcessingActionState> {
  const destination = destinationSchema.safeParse(destinationValue);
  if (!destination.success) return { error: "Unsupported processing destination." };
  const resolved = await annotationContext(projectId, sourceId, annotationId);
  if (!resolved) return { error: "Source annotation not found." };
  const { context, annotation } = resolved;

  if (destination.data === "indicator") {
    const parsed = indicatorSchema.safeParse({
      value: formData.get("value"),
      type: formData.get("type"),
      confidence: "MEDIUM",
      status: "UNVERIFIED",
      source: null,
      tags: "",
      first_seen: formData.get("first_seen") ?? "",
      last_seen: formData.get("last_seen") ?? "",
      analyst_rationale: "",
      current_relevance: "",
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid Indicator." };

    const normalized = normalizeIndicatorValue(parsed.data.value, parsed.data.type);
    const { data: existing } = await context.supabase
      .from("indicators")
      .select("id,value,type")
      .eq("project_id", context.projectId)
      .eq("type", parsed.data.type)
      .eq("normalized_value", normalized)
      .maybeSingle();
    if (existing) {
      const ledgerError = await recordOutput({
        context,
        annotation,
        destination: "indicator",
        targetId: existing.id,
        targetLabel: `${existing.type} · ${existing.value}`,
        action: "LINKED",
        normalizedValue: normalized,
      });
      if (ledgerError) return { error: "Unable to record Indicator provenance." };
      revalidateProcessing(context.projectId, sourceId, "indicator", existing.id);
      return {
        success: "Exact existing Indicator linked to this annotation.",
        targetId: existing.id,
        targetType: "indicator",
        linkedExisting: true,
      };
    }

    const { data, error } = await context.supabase
      .from("indicators")
      .insert({ ...parsed.data, project_id: context.projectId })
      .select("id,value,type")
      .single();
    if (error || !data) return { error: "Unable to create Indicator." };
    return finishCreatedOutput({
      context,
      annotation,
      sourceId,
      destination: "indicator",
      targetId: data.id,
      targetLabel: `${data.type} · ${data.value}`,
      normalizedValue: normalized,
    });
  }

  if (destination.data === "malware") {
    const hashes = Object.fromEntries(
      ["md5", "sha1", "sha256"]
        .map((key) => [key, String(formData.get(key) ?? "").trim()])
        .filter(([, value]) => value),
    );
    const parsed = malwareSchema.safeParse({
      name: formData.get("name"),
      family: formData.get("family"),
      hashes: JSON.stringify(hashes),
      description: formData.get("description") ?? "",
      behavior: formData.get("behavior") ?? "",
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid Malware." };
    const { data, error } = await context.supabase
      .from("malware")
      .insert({ ...parsed.data, project_id: context.projectId })
      .select("id,name")
      .single();
    if (error?.code === "23505") {
      return { error: "A Malware record with this name already exists. Link the existing record instead." };
    }
    if (error || !data) return { error: "Unable to create Malware." };
    return finishCreatedOutput({
      context,
      annotation,
      sourceId,
      destination: "malware",
      targetId: data.id,
      targetLabel: data.name,
      normalizedValue: data.name,
    });
  }

  if (destination.data === "cve") {
    const parsed = cveSchema.safeParse({
      cve_id: formData.get("cve_id"),
      severity: formData.get("severity"),
      description: formData.get("description") ?? "",
      affected_product: formData.get("affected_product") ?? "",
      exploit_status: formData.get("exploit_status") ?? "NONE",
      references: "",
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid CVE." };
    const { data: existing } = await context.supabase
      .from("cves")
      .select("id,cve_id")
      .eq("project_id", context.projectId)
      .eq("cve_id", parsed.data.cve_id)
      .maybeSingle();
    if (existing) {
      const ledgerError = await recordOutput({
        context,
        annotation,
        destination: "cve",
        targetId: existing.id,
        targetLabel: existing.cve_id,
        action: "LINKED",
        normalizedValue: existing.cve_id,
      });
      if (ledgerError) return { error: "Unable to record CVE provenance." };
      revalidateProcessing(context.projectId, sourceId, "cve", existing.id);
      return {
        success: "Existing CVE linked to this annotation.",
        targetId: existing.id,
        targetType: "cve",
        linkedExisting: true,
      };
    }
    const { data, error } = await context.supabase
      .from("cves")
      .insert({ ...parsed.data, project_id: context.projectId })
      .select("id,cve_id")
      .single();
    if (error || !data) return { error: "Unable to create CVE." };
    return finishCreatedOutput({
      context,
      annotation,
      sourceId,
      destination: "cve",
      targetId: data.id,
      targetLabel: data.cve_id,
      normalizedValue: data.cve_id,
    });
  }

  if (destination.data === "mitre") {
    const parsed = mitreSchema.safeParse({
      technique_id: formData.get("technique_id"),
      technique_name: formData.get("technique_name"),
      tactic: formData.get("tactic"),
      description: formData.get("description") ?? "",
    });
    const origin = mappingOriginSchema.safeParse(
      formData.get("mapping_origin") ?? "ANALYST_MAPPED",
    );
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid MITRE Technique." };
    if (!origin.success) return { error: "Invalid mapping origin." };

    const { data: existing } = await context.supabase
      .from("mitre_techniques")
      .select("id,technique_id,technique_name")
      .eq("project_id", context.projectId)
      .eq("technique_id", parsed.data.technique_id)
      .maybeSingle();
    if (existing) {
      const ledgerError = await recordOutput({
        context,
        annotation,
        destination: "mitre",
        targetId: existing.id,
        targetLabel: `${existing.technique_id} · ${existing.technique_name}`,
        action: "LINKED",
        normalizedValue: existing.technique_id,
        mappingOrigin: origin.data,
      });
      if (ledgerError) return { error: "Unable to record ATT&CK mapping provenance." };
      revalidateProcessing(context.projectId, sourceId, "mitre", existing.id);
      return {
        success: "Existing ATT&CK Technique linked to this annotation.",
        targetId: existing.id,
        targetType: "mitre",
        linkedExisting: true,
      };
    }

    const { data, error } = await context.supabase
      .from("mitre_techniques")
      .insert({ ...parsed.data, project_id: context.projectId })
      .select("id,technique_id,technique_name")
      .single();
    if (error || !data) return { error: "Unable to create MITRE Technique." };
    return finishCreatedOutput({
      context,
      annotation,
      sourceId,
      destination: "mitre",
      targetId: data.id,
      targetLabel: `${data.technique_id} · ${data.technique_name}`,
      normalizedValue: data.technique_id,
      mappingOrigin: origin.data,
    });
  }

  if (destination.data === "campaign") {
    const parsed = campaignSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description") ?? "",
      start_date: "",
      end_date: "",
      targets: "",
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid Campaign." };
    const { data, error } = await context.supabase
      .from("campaigns")
      .insert({ ...parsed.data, project_id: context.projectId })
      .select("id,name")
      .single();
    if (error?.code === "23505") return { error: "A Campaign with this name already exists. Link it instead." };
    if (error || !data) return { error: "Unable to create Campaign." };
    return finishCreatedOutput({
      context,
      annotation,
      sourceId,
      destination: "campaign",
      targetId: data.id,
      targetLabel: data.name,
      normalizedValue: data.name,
      mappingOrigin: "SOURCE_EXPLICIT",
    });
  }

  if (destination.data === "actor") {
    const parsed = actorSchema.safeParse({
      name: formData.get("name"),
      aliases: formData.get("aliases") ?? "",
      country: formData.get("country") ?? "",
      motivations: "",
      description: formData.get("description") ?? "",
      known_ttps: "",
      references: "",
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid Threat Actor." };
    const { data, error } = await context.supabase
      .from("threat_actors")
      .insert({ ...parsed.data, project_id: context.projectId })
      .select("id,name")
      .single();
    if (error?.code === "23505") return { error: "A Threat Actor with this canonical name already exists. Link it instead." };
    if (error || !data) return { error: "Unable to create Threat Actor." };
    return finishCreatedOutput({
      context,
      annotation,
      sourceId,
      destination: "actor",
      targetId: data.id,
      targetLabel: data.name,
      normalizedValue: data.name,
      mappingOrigin: "SOURCE_EXPLICIT",
    });
  }

  const claim = attributionClaimSchema.safeParse({
    claim_summary: formData.get("claim_summary"),
    claimed_actor_text: formData.get("claimed_actor_text"),
    canonical_threat_actor_id: formData.get("canonical_threat_actor_id"),
    mapping_origin: formData.get("mapping_origin") ?? "SOURCE_EXPLICIT",
  });
  if (!claim.success) {
    return { error: claim.error.issues[0]?.message ?? "Invalid attribution claim." };
  }
  if (claim.data.canonical_threat_actor_id) {
    const { data: actor } = await context.supabase
      .from("threat_actors")
      .select("id")
      .eq("project_id", context.projectId)
      .eq("id", claim.data.canonical_threat_actor_id)
      .maybeSingle();
    if (!actor) return { error: "Selected canonical Threat Actor is not in this Investigation." };
  }

  const { data, error } = await context.supabase
    .from("source_attribution_claims")
    .insert({
      ...claim.data,
      project_id: context.projectId,
      source_annotation_id: annotation.id,
      created_by: context.user.id,
    })
    .select("id,claimed_actor_text")
    .single();
  if (error || !data) return { error: "Unable to record source attribution claim." };
  return finishCreatedOutput({
    context,
    annotation,
    sourceId,
    destination: "attribution_claim",
    targetId: data.id,
    targetLabel: `Source attribution claim · ${data.claimed_actor_text}`,
    normalizedValue: claim.data.canonical_threat_actor_id ?? claim.data.claimed_actor_text,
    mappingOrigin: claim.data.mapping_origin,
  });
}

async function targetLabel(
  context: Context,
  destination: ProcessingDestination,
  targetId: string,
): Promise<{ label: string; normalized: string } | null> {
  if (destination === "indicator") {
    const { data } = await context.supabase
      .from("indicators")
      .select("id,value,type,normalized_value")
      .eq("project_id", context.projectId)
      .eq("id", targetId)
      .maybeSingle();
    return data
      ? { label: `${data.type} · ${data.value}`, normalized: data.normalized_value }
      : null;
  }
  if (destination === "malware") {
    const { data } = await context.supabase
      .from("malware")
      .select("id,name")
      .eq("project_id", context.projectId)
      .eq("id", targetId)
      .maybeSingle();
    return data ? { label: data.name, normalized: data.name } : null;
  }
  if (destination === "cve") {
    const { data } = await context.supabase
      .from("cves")
      .select("id,cve_id")
      .eq("project_id", context.projectId)
      .eq("id", targetId)
      .maybeSingle();
    return data ? { label: data.cve_id, normalized: data.cve_id } : null;
  }
  if (destination === "mitre") {
    const { data } = await context.supabase
      .from("mitre_techniques")
      .select("id,technique_id,technique_name")
      .eq("project_id", context.projectId)
      .eq("id", targetId)
      .maybeSingle();
    return data
      ? {
          label: `${data.technique_id} · ${data.technique_name}`,
          normalized: data.technique_id,
        }
      : null;
  }
  if (destination === "campaign") {
    const { data } = await context.supabase
      .from("campaigns")
      .select("id,name")
      .eq("project_id", context.projectId)
      .eq("id", targetId)
      .maybeSingle();
    return data ? { label: data.name, normalized: data.name } : null;
  }
  if (destination === "actor") {
    const { data } = await context.supabase
      .from("threat_actors")
      .select("id,name")
      .eq("project_id", context.projectId)
      .eq("id", targetId)
      .maybeSingle();
    return data ? { label: data.name, normalized: data.name } : null;
  }
  return null;
}

export async function linkAnnotationOutput(
  projectId: string,
  sourceId: string,
  annotationId: string,
  destinationValue: ProcessingDestination,
  targetId: string,
  mappingOriginValue: MappingOrigin = "SOURCE_EXPLICIT",
): Promise<ProcessingActionState> {
  const destination = destinationSchema.safeParse(destinationValue);
  const target = uuid.safeParse(targetId);
  const origin = mappingOriginSchema.safeParse(mappingOriginValue);
  if (!destination.success || destination.data === "attribution_claim" || !target.success) {
    return { error: "Invalid existing-record selection." };
  }
  if (!origin.success) return { error: "Invalid mapping origin." };

  const resolved = await annotationContext(projectId, sourceId, annotationId);
  if (!resolved) return { error: "Source annotation not found." };
  const label = await targetLabel(resolved.context, destination.data, target.data);
  if (!label) return { error: "The selected record is not available in this Investigation." };

  const error = await recordOutput({
    context: resolved.context,
    annotation: resolved.annotation,
    destination: destination.data,
    targetId: target.data,
    targetLabel: label.label,
    action: "LINKED",
    normalizedValue: label.normalized,
    mappingOrigin: origin.data,
  });
  if (error) return { error: "Unable to record annotation provenance." };

  revalidateProcessing(
    resolved.context.projectId,
    resolved.sourceId,
    destination.data,
    target.data,
  );
  return {
    success: "Existing record linked to the source annotation.",
    targetId: target.data,
    targetType: destination.data,
  };
}

export async function unlinkAnnotationOutput(
  projectId: string,
  sourceId: string,
  annotationId: string,
  outputId: string,
): Promise<ProcessingActionState> {
  const output = uuid.safeParse(outputId);
  if (!output.success) return { error: "Processing output not found." };
  const resolved = await annotationContext(projectId, sourceId, annotationId);
  if (!resolved) return { error: "Source annotation not found." };

  const { data, error } = await resolved.context.supabase
    .from("source_annotation_outputs")
    .delete()
    .eq("project_id", resolved.context.projectId)
    .eq("source_annotation_id", resolved.annotation.id)
    .eq("id", output.data)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "Unable to unlink processing output." };

  revalidateProcessing(resolved.context.projectId, resolved.sourceId);
  return { success: "Annotation output unlinked. The structured record was preserved." };
}
