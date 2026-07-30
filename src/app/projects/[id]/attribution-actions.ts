"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  assessmentSchema,
  evaluationSchema,
  evidenceSchema,
  hypothesisSchema,
} from "@/lib/attribution/schema";
import { requiredUuidSchema } from "@/lib/workspace/schema";
type State = { error?: string; success?: string };
const entries = (f: FormData) => Object.fromEntries(f.entries());
async function context(projectId: string, campaignId: string) {
  if (
    !requiredUuidSchema.safeParse(projectId).success ||
    !requiredUuidSchema.safeParse(campaignId).success
  )
    return null;
  const a = await requireUser();
  const [{ data: p }, { data: c }] = await Promise.all([
    a.supabase
      .from("projects")
      .select("id,owner_id")
      .eq("id", projectId)
      .maybeSingle(),
    a.supabase
      .from("campaigns")
      .select("id")
      .eq("project_id", projectId)
      .eq("id", campaignId)
      .maybeSingle(),
  ]);
  return p?.owner_id === a.user.id && c
    ? { ...a, projectId, campaignId }
    : null;
}
async function owns(
  c: NonNullable<Awaited<ReturnType<typeof context>>>,
  table: string,
  id: string,
  campaign = false,
) {
  if (!requiredUuidSchema.safeParse(id).success) return false;
  let q = c.supabase
    .from(table)
    .select("id")
    .eq("project_id", c.projectId)
    .eq("id", id);
  if (campaign) q = q.eq("campaign_id", c.campaignId);
  const { data, error } = await q.maybeSingle();
  return !error && !!data;
}
const refresh = (p: string, c: string) => {
  revalidatePath(`/projects/${p}/campaigns/${c}`);
  revalidatePath(`/projects/${p}/campaigns/${c}/attribution`);
};
export async function saveHypothesis(
  p: string,
  cid: string,
  hid: string | undefined,
  _: State,
  f: FormData,
): Promise<State> {
  const c = await context(p, cid);
  if (!c) return { error: "Campaign not found." };
  const v = hypothesisSchema.safeParse(entries(f));
  if (!v.success) return { error: v.error.issues[0].message };
  if (hid && !(await owns(c, "attribution_hypotheses", hid, true)))
    return { error: "Hypothesis not found." };
  if (
    v.data.subject_kind === "EXISTING_THREAT_ACTOR" &&
    !(await owns(c, "threat_actors", v.data.threat_actor_id!))
  )
    return { error: "Threat Actor not found." };
  const row = {
    ...v.data,
    threat_actor_id:
      v.data.subject_kind === "EXISTING_THREAT_ACTOR"
        ? v.data.threat_actor_id
        : null,
    project_id: p,
    campaign_id: cid,
    created_by: c.user.id,
  };
  const q = hid
    ? c.supabase
        .from("attribution_hypotheses")
        .update(row)
        .eq("project_id", p)
        .eq("campaign_id", cid)
        .eq("id", hid)
    : c.supabase.from("attribution_hypotheses").insert(row);
  const { error } = await q;
  if (error)
    return {
      error:
        "Unable to save hypothesis. Change the current judgement before rejecting a preferred hypothesis.",
    };
  refresh(p, cid);
  return { success: "Hypothesis saved." };
}
export async function setHypothesisArchived(
  p: string,
  cid: string,
  hid: string,
  archive: boolean,
  _: State,
): Promise<State> {
  const c = await context(p, cid);
  if (!c || !(await owns(c, "attribution_hypotheses", hid, true)))
    return { error: "Hypothesis not found." };
  const { error } = await c.supabase
    .from("attribution_hypotheses")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("project_id", p)
    .eq("campaign_id", cid)
    .eq("id", hid);
  if (error)
    return {
      error:
        "Unable to change archive state. A preferred hypothesis must first be replaced.",
    };
  refresh(p, cid);
  return {
    success: archive
      ? "Hypothesis archived."
      : "Hypothesis restored with its analytical status preserved.",
  };
}
export async function saveAssessment(
  p: string,
  cid: string,
  _: State,
  f: FormData,
): Promise<State> {
  const c = await context(p, cid);
  if (!c) return { error: "Campaign not found." };
  const v = assessmentSchema.safeParse(entries(f));
  if (!v.success) return { error: v.error.issues[0].message };
  const preferred = v.data.preferred_hypothesis_id?.trim() || null;
  if (preferred && !(await owns(c, "attribution_hypotheses", preferred, true)))
    return { error: "Preferred hypothesis not found." };
  const { error } = await c.supabase
    .from("campaign_attribution_assessments")
    .upsert(
      {
        ...v.data,
        preferred_hypothesis_id: preferred,
        assessed_at: v.data.assessed_at
          ? new Date(v.data.assessed_at).toISOString()
          : null,
        project_id: p,
        campaign_id: cid,
        created_by: c.user.id,
      },
      { onConflict: "campaign_id" },
    );
  if (error) return { error: "Unable to save attribution judgement." };
  refresh(p, cid);
  return { success: "Attribution judgement saved." };
}
export async function addEvidence(
  p: string,
  cid: string,
  _: State,
  f: FormData,
): Promise<State> {
  const c = await context(p, cid);
  if (!c) return { error: "Campaign not found." };
  const v = evidenceSchema.safeParse(entries(f));
  if (!v.success) return { error: v.error.issues[0].message };
  const tables = {
    source: "sources",
    evidence: "evidence",
    timeline_event: "timeline_events",
    infrastructure_cluster: "infrastructure_clusters",
    indicator: "indicators",
    enrichment_result: "enrichment_results",
    malware: "malware",
    mitre_technique: "mitre_techniques",
  } as const;
  if (!(await owns(c, tables[v.data.reference_type], v.data.reference_id)))
    return { error: "Referenced record not found." };
  const { error } = await c.supabase
    .from("attribution_evidence_items")
    .insert({
      project_id: p,
      campaign_id: cid,
      title: v.data.title,
      relevance_note: v.data.relevance_note,
      [`${v.data.reference_type}_id`]: v.data.reference_id,
      created_by: c.user.id,
    });
  if (error)
    return {
      error:
        "Unable to add evidence; it may already be in this Campaign inventory.",
    };
  refresh(p, cid);
  return { success: "Evidence added." };
}
export async function saveEvaluation(
  p: string,
  cid: string,
  _: State,
  f: FormData,
): Promise<State> {
  const c = await context(p, cid);
  if (!c) return { error: "Campaign not found." };
  const v = evaluationSchema.safeParse(entries(f));
  if (!v.success) return { error: v.error.issues[0].message };
  if (
    !(await owns(c, "attribution_hypotheses", v.data.hypothesis_id, true)) ||
    !(await owns(
      c,
      "attribution_evidence_items",
      v.data.evidence_item_id,
      true,
    ))
  )
    return { error: "Hypothesis or evidence item not found." };
  const { error } = await c.supabase
    .from("attribution_evidence_evaluations")
    .upsert(
      { ...v.data, project_id: p, campaign_id: cid, created_by: c.user.id },
      { onConflict: "hypothesis_id,evidence_item_id" },
    );
  if (error) return { error: "Unable to save evaluation." };
  refresh(p, cid);
  return {
    success:
      "Evaluation saved without changing hypothesis status or confidence.",
  };
}
export async function unlinkEvaluation(
  p: string,
  cid: string,
  id: string,
  _: State,
): Promise<State> {
  const c = await context(p, cid);
  if (!c || !(await owns(c, "attribution_evidence_evaluations", id, true)))
    return { error: "Evaluation not found." };
  const { error } = await c.supabase
    .from("attribution_evidence_evaluations")
    .delete()
    .eq("project_id", p)
    .eq("campaign_id", cid)
    .eq("id", id);
  if (error) return { error: "Unable to unlink evaluation." };
  refresh(p, cid);
  return {
    success: "Evaluation unlinked; evidence and hypothesis were preserved.",
  };
}
