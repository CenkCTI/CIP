"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  clusterMembershipSchema,
  entityLinkSchema,
  membershipSchema,
  reconstructionSchema,
  supportLinkSchema,
} from "@/lib/reconstruction/schema";
import { requiredUuidSchema } from "@/lib/workspace/schema";

type State = { error?: string; success?: string };
type Context = Awaited<ReturnType<typeof requireUser>> & { projectId: string };
type ContextResult = { ok: true; value: Context } | { ok: false; state: State };

const values = (formData: FormData) => Object.fromEntries(formData.entries());
const validationMessage = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message ?? "Invalid input.";

async function getContext(projectId: string): Promise<ContextResult> {
  const parsed = requiredUuidSchema.safeParse(projectId);
  if (!parsed.success) return { ok: false, state: { error: "Investigation not found." } };

  const auth = await requireUser();
  const { data, error } = await auth.supabase
    .from("projects")
    .select("id,owner_id")
    .eq("id", parsed.data)
    .maybeSingle();
  if (error || !data || data.owner_id !== auth.user.id) {
    return { ok: false, state: { error: "Investigation not found." } };
  }
  return { ok: true, value: { ...auth, projectId: parsed.data } };
}

async function ownsRecord(context: Context, table: string, id: string) {
  const parsed = requiredUuidSchema.safeParse(id);
  if (!parsed.success) return false;
  const { data, error } = await context.supabase
    .from(table)
    .select("id")
    .eq("project_id", context.projectId)
    .eq("id", parsed.data)
    .maybeSingle();
  return !error && Boolean(data);
}

function refresh(projectId: string, eventId?: string) {
  revalidatePath(`/projects/${projectId}`);
  if (eventId) revalidatePath(`/projects/${projectId}/timeline/${eventId}`);
}

export async function saveReconstruction(
  projectId: string,
  campaignId: string,
  _: State,
  formData: FormData,
): Promise<State> {
  const result = await getContext(projectId);
  if (!result.ok) return result.state;
  const context = result.value;
  if (!(await ownsRecord(context, "campaigns", campaignId))) {
    return { error: "Campaign not found." };
  }
  const parsed = reconstructionSchema.safeParse(values(formData));
  if (!parsed.success) return { error: validationMessage(parsed) };
  const { error } = await context.supabase.from("campaign_reconstructions").upsert(
    {
      ...parsed.data,
      project_id: context.projectId,
      campaign_id: campaignId,
      created_by: context.user.id,
    },
    { onConflict: "campaign_id" },
  );
  if (error) return { error: "Unable to save reconstruction." };
  refresh(context.projectId);
  return { success: "Reconstruction saved." };
}

export async function saveEventMembership(
  projectId: string,
  eventId: string,
  _: State,
  formData: FormData,
): Promise<State> {
  const result = await getContext(projectId);
  if (!result.ok) return result.state;
  const context = result.value;
  if (!(await ownsRecord(context, "timeline_events", eventId))) {
    return { error: "Timeline event not found." };
  }
  const parsed = membershipSchema.safeParse(values(formData));
  if (!parsed.success) return { error: validationMessage(parsed) };
  if (!(await ownsRecord(context, "campaigns", parsed.data.campaign_id))) {
    return { error: "Campaign not found." };
  }
  const { error } = await context.supabase.from("campaign_timeline_events").upsert(
    {
      ...parsed.data,
      sequence_order: parsed.data.sequence_order ?? null,
      project_id: context.projectId,
      timeline_event_id: eventId,
      created_by: context.user.id,
    },
    { onConflict: "campaign_id,timeline_event_id" },
  );
  if (error) return { error: "Unable to save Campaign membership." };
  refresh(context.projectId, eventId);
  return { success: "Campaign membership saved." };
}

export async function unlinkHistoricalEventMembership(
  projectId: string,
  eventId: string,
  membershipId: string,
  _: State,
  formData: FormData,
): Promise<State> {
  if (formData.get("confirm") !== "UNLINK") {
    return { error: "Type UNLINK to confirm removal of historical membership." };
  }
  const result = await getContext(projectId);
  if (!result.ok) return result.state;
  const context = result.value;
  const parsedId = requiredUuidSchema.safeParse(membershipId);
  if (!parsedId.success || !(await ownsRecord(context, "timeline_events", eventId))) {
    return { error: "Campaign membership not found." };
  }
  const { data, error: readError } = await context.supabase
    .from("campaign_timeline_events")
    .select("id,status")
    .eq("project_id", context.projectId)
    .eq("timeline_event_id", eventId)
    .eq("id", parsedId.data)
    .maybeSingle();
  if (readError || !data) return { error: "Campaign membership not found." };
  if (!["REJECTED", "REMOVED"].includes(data.status)) {
    return { error: "Only rejected or removed Campaign memberships can be unlinked." };
  }
  const { error } = await context.supabase
    .from("campaign_timeline_events")
    .delete()
    .eq("project_id", context.projectId)
    .eq("timeline_event_id", eventId)
    .eq("id", parsedId.data)
    .in("status", ["REJECTED", "REMOVED"]);
  if (error) return { error: "Unable to unlink historical Campaign membership." };
  refresh(context.projectId, eventId);
  return { success: "Historical Campaign membership unlinked." };
}

export async function saveClusterMembership(
  projectId: string,
  campaignId: string,
  _: State,
  formData: FormData,
): Promise<State> {
  const result = await getContext(projectId);
  if (!result.ok) return result.state;
  const context = result.value;
  const parsed = clusterMembershipSchema.safeParse(values(formData));
  if (!parsed.success) return { error: validationMessage(parsed) };
  if (
    !(await ownsRecord(context, "campaigns", campaignId)) ||
    !(await ownsRecord(context, "infrastructure_clusters", parsed.data.infrastructure_cluster_id))
  ) {
    return { error: "Campaign or Infrastructure Cluster not found." };
  }
  const { error } = await context.supabase.from("campaign_infrastructure_clusters").upsert(
    {
      ...parsed.data,
      project_id: context.projectId,
      campaign_id: campaignId,
      created_by: context.user.id,
    },
    { onConflict: "campaign_id,infrastructure_cluster_id" },
  );
  if (error) return { error: "Unable to save infrastructure relationship." };
  refresh(context.projectId);
  return { success: "Infrastructure relationship saved." };
}

export async function linkEventEntity(
  projectId: string,
  eventId: string,
  _: State,
  formData: FormData,
): Promise<State> {
  const result = await getContext(projectId);
  if (!result.ok) return result.state;
  const context = result.value;
  const parsed = entityLinkSchema.safeParse(values(formData));
  if (!parsed.success) return { error: validationMessage(parsed) };
  const tables = {
    indicator: "indicators",
    infrastructure_cluster: "infrastructure_clusters",
    malware: "malware",
    cve: "cves",
    mitre_technique: "mitre_techniques",
  } as const;
  if (
    !(await ownsRecord(context, "timeline_events", eventId)) ||
    !(await ownsRecord(context, tables[parsed.data.entity_type], parsed.data.entity_id))
  ) {
    return { error: "Timeline event or technical entity not found." };
  }
  const { error } = await context.supabase.from("timeline_event_entities").insert({
    project_id: context.projectId,
    timeline_event_id: eventId,
    [`${parsed.data.entity_type}_id`]: parsed.data.entity_id,
    role: parsed.data.role,
    analyst_note: parsed.data.analyst_note,
    created_by: context.user.id,
  });
  if (error) return { error: "Unable to link technical entity." };
  refresh(context.projectId, eventId);
  return { success: "Technical entity linked." };
}

export async function linkEventSupport(
  projectId: string,
  eventId: string,
  supportType: "source" | "evidence" | "enrichment_result",
  _: State,
  formData: FormData,
): Promise<State> {
  const result = await getContext(projectId);
  if (!result.ok) return result.state;
  const context = result.value;
  const parsed = supportLinkSchema.safeParse({
    support_type: supportType,
    support_id: formData.get("support_id"),
    analyst_note: formData.get("analyst_note") ?? "",
  });
  if (!parsed.success) return { error: validationMessage(parsed) };
  const tables = {
    source: "sources",
    evidence: "evidence",
    enrichment_result: "enrichment_results",
  } as const;
  if (
    !(await ownsRecord(context, "timeline_events", eventId)) ||
    !(await ownsRecord(context, tables[supportType], parsed.data.support_id))
  ) {
    return { error: "Timeline event or supporting record not found." };
  }
  const { error } = await context.supabase.from("timeline_event_support").insert({
    project_id: context.projectId,
    timeline_event_id: eventId,
    [`${supportType}_id`]: parsed.data.support_id,
    analyst_note: parsed.data.analyst_note,
    created_by: context.user.id,
  });
  if (error) return { error: "Unable to link supporting material." };
  refresh(context.projectId, eventId);
  return { success: "Supporting material linked." };
}

export async function unlinkEventRecord(
  projectId: string,
  eventId: string,
  table: "timeline_event_entities" | "timeline_event_support",
  recordId: string,
  _: State,
  formData: FormData,
): Promise<State> {
  if (formData.get("confirm") !== "UNLINK") {
    return { error: "Confirm unlinking this record." };
  }
  const result = await getContext(projectId);
  if (!result.ok) return result.state;
  const context = result.value;
  const parsedId = requiredUuidSchema.safeParse(recordId);
  if (!parsedId.success || !(await ownsRecord(context, "timeline_events", eventId))) {
    return { error: "Linked record not found." };
  }
  const { data, error } = await context.supabase
    .from(table)
    .delete()
    .eq("project_id", context.projectId)
    .eq("timeline_event_id", eventId)
    .eq("id", parsedId.data)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "Unable to unlink the selected record." };
  refresh(context.projectId, eventId);
  return { success: "Record unlinked." };
}
