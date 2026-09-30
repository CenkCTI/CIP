"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOwnedProject } from "@/lib/projects/ownership";
import { timelineV2FormSchema } from "@/lib/workspace/schema";

export type TimelineActionState = {
  error?: string;
  success?: string;
  eventId?: string;
};

const uuid = z.string().uuid();

function formValues(formData: FormData) {
  return {
    event_name: formData.get("event_name"),
    event_date: formData.get("event_date"),
    occurred_end_at: formData.get("occurred_end_at") ?? "",
    time_precision: formData.get("time_precision") ?? "DAY",
    time_label: formData.get("time_label") ?? "",
    description: formData.get("description") ?? "",
    basis: formData.get("basis") ?? "OBSERVED",
    activity_phase: formData.get("activity_phase") ?? "UNKNOWN",
    assessment_status: formData.get("assessment_status") ?? "RECORDED",
    confidence: formData.get("confidence") ?? "MEDIUM",
    analyst_rationale: formData.get("analyst_rationale") ?? "",
  };
}

function validationMessage(result: ReturnType<typeof timelineV2FormSchema.safeParse>) {
  return result.success ? "" : result.error.issues[0]?.message ?? "Invalid Timeline event.";
}

async function eventExists(
  context: Awaited<ReturnType<typeof requireOwnedProject>>,
  eventId: string,
) {
  const { data } = await context.supabase
    .from("timeline_events")
    .select("id")
    .eq("project_id", context.projectId)
    .eq("id", eventId)
    .maybeSingle();
  return Boolean(data);
}

export async function createTimelineEventV2(
  projectId: string,
  formData: FormData,
): Promise<TimelineActionState> {
  const context = await requireOwnedProject(projectId);
  const parsed = timelineV2FormSchema.safeParse(formValues(formData));
  if (!parsed.success) return { error: validationMessage(parsed) };

  const { data, error } = await context.supabase
    .from("timeline_events")
    .insert({ ...parsed.data, project_id: context.projectId })
    .select("id")
    .single();
  if (error || !data) return { error: "Unable to save Timeline event." };

  revalidatePath(`/projects/${context.projectId}`);
  return { success: "Timeline event created.", eventId: data.id };
}

export async function updateTimelineEventV2(
  projectId: string,
  eventId: string,
  formData: FormData,
): Promise<TimelineActionState> {
  const parsedId = uuid.safeParse(eventId);
  if (!parsedId.success) return { error: "Timeline event not found." };
  const context = await requireOwnedProject(projectId);
  if (!(await eventExists(context, parsedId.data))) return { error: "Timeline event not found." };

  const parsed = timelineV2FormSchema.safeParse(formValues(formData));
  if (!parsed.success) return { error: validationMessage(parsed) };

  const { error } = await context.supabase
    .from("timeline_events")
    .update(parsed.data)
    .eq("project_id", context.projectId)
    .eq("id", parsedId.data);
  if (error) return { error: "Unable to update Timeline event." };

  revalidatePath(`/projects/${context.projectId}`);
  revalidatePath(`/projects/${context.projectId}/timeline/${parsedId.data}`);
  return { success: "Timeline event updated.", eventId: parsedId.data };
}

export async function linkAnnotationToTimelineEvent(
  projectId: string,
  sourceId: string,
  annotationId: string,
  eventId: string,
): Promise<TimelineActionState> {
  const [source, annotation, event] = [sourceId, annotationId, eventId].map((value) => uuid.safeParse(value));
  if (!source.success || !annotation.success || !event.success) {
    return { error: "Invalid Timeline or source annotation selection." };
  }
  const context = await requireOwnedProject(projectId);
  const [{ data: annotationRow }, { data: eventRow }] = await Promise.all([
    context.supabase
      .from("source_annotations")
      .select("id,source_id")
      .eq("project_id", context.projectId)
      .eq("source_id", source.data)
      .eq("id", annotation.data)
      .maybeSingle(),
    context.supabase
      .from("timeline_events")
      .select("id")
      .eq("project_id", context.projectId)
      .eq("id", event.data)
      .maybeSingle(),
  ]);
  if (!annotationRow || !eventRow) return { error: "Timeline event or annotation was not found." };

  const { error } = await context.supabase.from("timeline_event_source_annotations").upsert(
    {
      project_id: context.projectId,
      timeline_event_id: event.data,
      source_annotation_id: annotation.data,
      created_by: context.user.id,
    },
    { onConflict: "project_id,timeline_event_id,source_annotation_id" },
  );
  if (error) return { error: "Unable to link the annotation to the Timeline event." };

  revalidatePath(`/projects/${context.projectId}/sources/${source.data}`);
  revalidatePath(`/projects/${context.projectId}/timeline/${event.data}`);
  revalidatePath(`/projects/${context.projectId}`);
  return { success: "Annotation linked to Timeline.", eventId: event.data };
}

export async function createTimelineEventFromAnnotation(
  projectId: string,
  sourceId: string,
  annotationId: string,
  formData: FormData,
): Promise<TimelineActionState> {
  const [source, annotation] = [sourceId, annotationId].map((value) => uuid.safeParse(value));
  if (!source.success || !annotation.success) return { error: "Source annotation not found." };

  const context = await requireOwnedProject(projectId);
  const { data: annotationRow } = await context.supabase
    .from("source_annotations")
    .select("id,source_id")
    .eq("project_id", context.projectId)
    .eq("source_id", source.data)
    .eq("id", annotation.data)
    .maybeSingle();
  if (!annotationRow) return { error: "Source annotation not found." };

  const parsed = timelineV2FormSchema.safeParse(formValues(formData));
  if (!parsed.success) return { error: validationMessage(parsed) };

  const { data: event, error: eventError } = await context.supabase
    .from("timeline_events")
    .insert({ ...parsed.data, project_id: context.projectId })
    .select("id")
    .single();
  if (eventError || !event) return { error: "Unable to create Timeline event." };

  const { error: linkError } = await context.supabase.from("timeline_event_source_annotations").insert({
    project_id: context.projectId,
    timeline_event_id: event.id,
    source_annotation_id: annotation.data,
    created_by: context.user.id,
  });

  if (linkError) {
    await context.supabase
      .from("timeline_events")
      .delete()
      .eq("project_id", context.projectId)
      .eq("id", event.id);
    return { error: "Timeline provenance link failed; the event was not retained." };
  }

  revalidatePath(`/projects/${context.projectId}/sources/${source.data}`);
  revalidatePath(`/projects/${context.projectId}`);
  return { success: "Timeline event created from the annotation.", eventId: event.id };
}

export async function unlinkTimelineAnnotation(
  projectId: string,
  eventId: string,
  linkId: string,
): Promise<TimelineActionState> {
  const [event, link] = [eventId, linkId].map((value) => uuid.safeParse(value));
  if (!event.success || !link.success) return { error: "Timeline annotation link not found." };
  const context = await requireOwnedProject(projectId);
  const { data, error } = await context.supabase
    .from("timeline_event_source_annotations")
    .delete()
    .eq("project_id", context.projectId)
    .eq("timeline_event_id", event.data)
    .eq("id", link.data)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "Unable to unlink source annotation." };

  revalidatePath(`/projects/${context.projectId}/timeline/${event.data}`);
  revalidatePath(`/projects/${context.projectId}`);
  return { success: "Source annotation unlinked." };
}
