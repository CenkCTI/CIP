"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOwnedProject } from "@/lib/projects/ownership";
import {
  observationSourceLinkSchema,
  sourceFormObject,
  sourceIdSchema,
  sourceSchema,
} from "@/lib/sources/schema";

export type SourceActionState = { error?: string; success?: string };

const projectIdSchema = z.string().uuid();

async function verifyEvidence(
  context: Awaited<ReturnType<typeof requireOwnedProject>>,
  evidenceId: string | null,
) {
  if (!evidenceId) return true;
  const { data, error } = await context.supabase
    .from("evidence")
    .select("id")
    .eq("project_id", context.projectId)
    .eq("id", evidenceId)
    .single();
  return !error && Boolean(data);
}

function refreshSourceViews(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}?tab=evidence&view=sources`);
}

export async function createSource(
  projectId: string,
  _state: SourceActionState,
  formData: FormData,
): Promise<SourceActionState> {
  try {
    if (!projectIdSchema.safeParse(projectId).success) throw new Error();
    const context = await requireOwnedProject(projectId);
    const parsed = sourceSchema.safeParse(sourceFormObject(formData));
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid Source input." };
    }
    if (!(await verifyEvidence(context, parsed.data.evidence_id))) {
      return { error: "The selected Evidence record is not available in this Investigation." };
    }

    const { error } = await context.supabase.from("sources").insert({
      ...parsed.data,
      project_id: context.projectId,
      origin_kind: "ANALYST",
      created_by: context.user.id,
    });
    if (error) return { error: "Source could not be created." };

    refreshSourceViews(context.projectId);
    return { success: "Source created." };
  } catch {
    return { error: "Investigation not found." };
  }
}

export async function updateSource(
  projectId: string,
  sourceId: string,
  _state: SourceActionState,
  formData: FormData,
): Promise<SourceActionState> {
  try {
    const parsedId = sourceIdSchema.safeParse(sourceId);
    if (!parsedId.success) return { error: "Source not found." };
    const context = await requireOwnedProject(projectId);
    const parsed = sourceSchema.safeParse(sourceFormObject(formData));
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid Source input." };
    }
    if (!(await verifyEvidence(context, parsed.data.evidence_id))) {
      return { error: "The selected Evidence record is not available in this Investigation." };
    }

    const { data, error } = await context.supabase
      .from("sources")
      .update(parsed.data)
      .eq("project_id", context.projectId)
      .eq("id", parsedId.data)
      .select("id")
      .single();
    if (error || !data) return { error: "Source could not be updated." };

    refreshSourceViews(context.projectId);
    return { success: "Source updated." };
  } catch {
    return { error: "Investigation not found." };
  }
}

async function setSourceArchiveState(
  projectId: string,
  sourceId: string,
  archived: boolean,
): Promise<SourceActionState> {
  try {
    const parsedId = sourceIdSchema.safeParse(sourceId);
    if (!parsedId.success) return { error: "Source not found." };
    const context = await requireOwnedProject(projectId);
    const { data, error } = await context.supabase
      .from("sources")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("project_id", context.projectId)
      .eq("id", parsedId.data)
      .select("id")
      .single();
    if (error || !data) return { error: "Source archive state could not be changed." };
    refreshSourceViews(context.projectId);
    return { success: archived ? "Source archived." : "Source restored." };
  } catch {
    return { error: "Investigation not found." };
  }
}

export async function archiveSource(projectId: string, sourceId: string) {
  return setSourceArchiveState(projectId, sourceId, true);
}

export async function restoreSource(projectId: string, sourceId: string) {
  return setSourceArchiveState(projectId, sourceId, false);
}

export async function deleteSource(projectId: string, sourceId: string) {
  try {
    const parsedId = sourceIdSchema.safeParse(sourceId);
    if (!parsedId.success) return { error: "Source not found." };
    const context = await requireOwnedProject(projectId);
    const [observationRefs, resultRefs] = await Promise.all([
      context.supabase
        .from("indicator_observations")
        .select("id", { count: "exact", head: true })
        .eq("project_id", context.projectId)
        .eq("source_id", parsedId.data),
      context.supabase
        .from("enrichment_results")
        .select("id", { count: "exact", head: true })
        .eq("project_id", context.projectId)
        .eq("source_id", parsedId.data),
    ]);
    if (observationRefs.error || resultRefs.error) {
      return { error: "Source references could not be checked safely." };
    }
    if ((observationRefs.count ?? 0) + (resultRefs.count ?? 0) > 0) {
      return { error: "Referenced Sources cannot be deleted. Archive this Source instead." };
    }

    const { error } = await context.supabase
      .from("sources")
      .delete()
      .eq("project_id", context.projectId)
      .eq("id", parsedId.data);
    if (error) {
      return { error: "Source could not be deleted. Archive referenced Sources instead." };
    }
    refreshSourceViews(context.projectId);
    return { success: "Unreferenced Source deleted." };
  } catch {
    return { error: "Investigation not found." };
  }
}

export async function linkObservationSource(
  projectId: string,
  observationId: string,
  _state: SourceActionState,
  formData: FormData,
): Promise<SourceActionState> {
  try {
    const observationIdParsed = z.string().uuid().safeParse(observationId);
    if (!observationIdParsed.success) return { error: "Observation not found." };
    const context = await requireOwnedProject(projectId);
    const parsed = observationSourceLinkSchema.safeParse({
      source_id: formData.get("source_id") ?? "",
      verification_state: formData.get("verification_state") ?? "UNVERIFIED",
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid provenance link." };
    }

    if (parsed.data.source_id) {
      const { data: source, error: sourceError } = await context.supabase
        .from("sources")
        .select("id,archived_at")
        .eq("project_id", context.projectId)
        .eq("id", parsed.data.source_id)
        .single();
      if (sourceError || !source || source.archived_at) {
        return { error: "The selected active Source is not available in this Investigation." };
      }
    }

    const { data, error } = await context.supabase
      .from("indicator_observations")
      .update(parsed.data)
      .eq("project_id", context.projectId)
      .eq("id", observationIdParsed.data)
      .select("id,indicator_id")
      .single();
    if (error || !data) return { error: "Observation provenance could not be updated." };

    revalidatePath(`/projects/${context.projectId}/indicators/${data.indicator_id}`);
    revalidatePath(`/projects/${context.projectId}`);
    return { success: parsed.data.source_id ? "Structured Source linked." : "Structured Source link removed." };
  } catch {
    return { error: "Investigation not found." };
  }
}
