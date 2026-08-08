"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  assessmentSchema,
  attributionCellDetailsSchema,
  attributionClueReferenceSchema,
  attributionClueSchema,
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
async function projectContext(projectId: string) {
  if (!requiredUuidSchema.safeParse(projectId).success) return null;
  const a = await requireUser();
  const { data: p } = await a.supabase
    .from("projects")
    .select("id,owner_id")
    .eq("id", projectId)
    .maybeSingle();
  return p?.owner_id === a.user.id ? { ...a, projectId } : null;
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
async function projectOwns(
  c: NonNullable<Awaited<ReturnType<typeof projectContext>>>,
  table: string,
  id: string,
) {
  if (!requiredUuidSchema.safeParse(id).success) return false;
  const { data, error } = await c.supabase
    .from(table)
    .select("id")
    .eq("project_id", c.projectId)
    .eq("id", id)
    .maybeSingle();
  return !error && !!data;
}
const refresh = (p: string, c: string) => {
  revalidatePath(`/projects/${p}/campaigns/${c}`);
  revalidatePath(`/projects/${p}/campaigns/${c}/attribution`);
  revalidatePath(`/projects/${p}/attribution`);
};
const refreshInvestigationAttribution = (p: string) => {
  revalidatePath(`/projects/${p}/attribution`);
};

export async function saveInvestigationHypothesis(
  p: string,
  hid: string | undefined,
  _: State,
  f: FormData,
): Promise<State> {
  const c = await projectContext(p);
  if (!c) return { error: "Investigation not found." };
  const v = hypothesisSchema.safeParse(entries(f));
  if (!v.success) return { error: v.error.issues[0].message };
  if (hid && !(await projectOwns(c, "attribution_hypotheses", hid)))
    return { error: "Hypothesis not found." };
  if (
    v.data.subject_kind === "EXISTING_THREAT_ACTOR" &&
    !(await projectOwns(c, "threat_actors", v.data.threat_actor_id!))
  )
    return { error: "Threat Actor not found." };
  const values = {
    ...v.data,
    threat_actor_id:
      v.data.subject_kind === "EXISTING_THREAT_ACTOR"
        ? v.data.threat_actor_id
        : null,
  };
  const q = hid
    ? c.supabase
        .from("attribution_hypotheses")
        .update(values)
        .eq("project_id", p)
        .eq("id", hid)
    : c.supabase.from("attribution_hypotheses").insert({
        ...values,
        project_id: p,
        campaign_id: null,
        created_by: c.user.id,
      });
  const { error } = await q;
  if (error)
    return {
      error:
        "Unable to save hypothesis. Change the current judgement before rejecting a preferred hypothesis.",
    };
  refreshInvestigationAttribution(p);
  return { success: "Hypothesis saved." };
}

export async function addAttributionClue(
  p: string,
  _: State,
  f: FormData,
): Promise<State> {
  const c = await projectContext(p);
  if (!c) return { error: "Investigation not found." };
  const v = attributionClueSchema.safeParse(entries(f));
  if (!v.success) return { error: v.error.issues[0].message };
  const { error } = await c.supabase.from("attribution_evidence_items").insert({
    project_id: p,
    campaign_id: null,
    title: v.data.title,
    relevance_note: v.data.relevance_note,
    created_by: c.user.id,
  });
  if (error) return { error: "Unable to add clue." };
  refreshInvestigationAttribution(p);
  return { success: "Clue added to the matrix." };
}

export async function addAttributionClueReference(
  p: string,
  clueId: string,
  _: State,
  f: FormData,
): Promise<State> {
  const c = await projectContext(p);
  if (!c || !(await projectOwns(c, "attribution_evidence_items", clueId)))
    return { error: "Clue not found." };
  const v = attributionClueReferenceSchema.safeParse(entries(f));
  if (!v.success) return { error: v.error.issues[0].message };
  const tables = {
    campaign: "campaigns",
    source: "sources",
    evidence: "evidence",
    timeline_event: "timeline_events",
    infrastructure_cluster: "infrastructure_clusters",
    indicator: "indicators",
    enrichment_result: "enrichment_results",
    malware: "malware",
    mitre_technique: "mitre_techniques",
  } as const;
  if (!(await projectOwns(c, tables[v.data.reference_type], v.data.reference_id)))
    return { error: "Referenced record not found." };
  const { error } = await c.supabase
    .from("attribution_evidence_item_links")
    .insert({
      project_id: p,
      evidence_item_id: clueId,
      [`${v.data.reference_type}_id`]: v.data.reference_id,
      created_by: c.user.id,
    });
  if (error)
    return { error: "Unable to link supporting material; it may already be linked." };
  refreshInvestigationAttribution(p);
  return { success: "Supporting material linked." };
}

export async function saveAttributionCellImpact(
  p: string,
  hypothesisId: string,
  clueId: string,
  impact: string,
  _: State,
  f: FormData,
): Promise<State> {
  const c = await projectContext(p);
  if (!c) return { error: "Investigation not found." };
  const impactResult = z
    .enum(["SUPPORTS", "CONTRADICTS", "NEUTRAL"])
    .safeParse(impact);
  if (!impactResult.success) return { error: "Invalid matrix impact." };
  const details = attributionCellDetailsSchema.safeParse(entries(f));
  if (!details.success) return { error: details.error.issues[0].message };
  const [{ data: hypothesis }, { data: clue }] = await Promise.all([
    c.supabase
      .from("attribution_hypotheses")
      .select("id,campaign_id,archived_at,status")
      .eq("project_id", p)
      .eq("id", hypothesisId)
      .maybeSingle(),
    c.supabase
      .from("attribution_evidence_items")
      .select("id,campaign_id,archived_at")
      .eq("project_id", p)
      .eq("id", clueId)
      .maybeSingle(),
  ]);
  if (!hypothesis || !clue) return { error: "Hypothesis or clue not found." };
  if (hypothesis.archived_at || hypothesis.status === "REJECTED")
    return { error: "Restore the hypothesis before evaluating it." };
  if (clue.archived_at) return { error: "Restore the clue before evaluating it." };
  const campaignId =
    hypothesis.campaign_id && hypothesis.campaign_id === clue.campaign_id
      ? hypothesis.campaign_id
      : null;
  const { error } = await c.supabase
    .from("attribution_evidence_evaluations")
    .upsert(
      {
        project_id: p,
        campaign_id: campaignId,
        hypothesis_id: hypothesisId,
        evidence_item_id: clueId,
        impact: impactResult.data,
        diagnostic_value: details.data.diagnostic_value,
        rationale: details.data.rationale,
        created_by: c.user.id,
      },
      { onConflict: "hypothesis_id,evidence_item_id" },
    );
  if (error) return { error: "Unable to update matrix cell." };
  refreshInvestigationAttribution(p);
  return { success: "Matrix cell updated." };
}

export async function clearAttributionCell(
  p: string,
  hypothesisId: string,
  clueId: string,
  _: State,
  _f: FormData,
): Promise<State> {
  const c = await projectContext(p);
  if (!c) return { error: "Investigation not found." };
  if (
    !(await projectOwns(c, "attribution_hypotheses", hypothesisId)) ||
    !(await projectOwns(c, "attribution_evidence_items", clueId))
  )
    return { error: "Hypothesis or clue not found." };
  const { error } = await c.supabase
    .from("attribution_evidence_evaluations")
    .delete()
    .eq("project_id", p)
    .eq("hypothesis_id", hypothesisId)
    .eq("evidence_item_id", clueId);
  if (error) return { error: "Unable to clear matrix cell." };
  refreshInvestigationAttribution(p);
  return { success: "Matrix cell cleared." };
}

export async function saveInvestigationAssessment(
  p: string,
  _: State,
  f: FormData,
): Promise<State> {
  const c = await projectContext(p);
  if (!c) return { error: "Investigation not found." };
  const v = assessmentSchema.safeParse(entries(f));
  if (!v.success) return { error: v.error.issues[0].message };
  const preferred = v.data.preferred_hypothesis_id?.trim() || null;
  if (preferred && !(await projectOwns(c, "attribution_hypotheses", preferred)))
    return { error: "Preferred hypothesis not found." };
  const { error } = await c.supabase
    .from("investigation_attribution_assessments")
    .upsert(
      {
        ...v.data,
        project_id: p,
        preferred_hypothesis_id: preferred,
        assessed_at: v.data.assessed_at
          ? new Date(v.data.assessed_at).toISOString()
          : null,
        created_by: c.user.id,
      },
      { onConflict: "project_id" },
    );
  if (error) return { error: "Unable to save attribution judgement." };
  refreshInvestigationAttribution(p);
  return { success: "Investigation attribution judgement saved." };
}

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
  const { error } = await c.supabase.from("attribution_evidence_items").insert({
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
export async function setEvidenceArchived(
  p: string,
  cid: string,
  evidenceId: string,
  archive: boolean,
  _: State,
): Promise<State> {
  const c = await context(p, cid);
  if (!c || !(await owns(c, "attribution_evidence_items", evidenceId, true)))
    return { error: "Evidence item not found." };
  const { error } = await c.supabase
    .from("attribution_evidence_items")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("project_id", p)
    .eq("campaign_id", cid)
    .eq("id", evidenceId);
  if (error) return { error: "Unable to change evidence archive state." };
  refresh(p, cid);
  return {
    success: archive
      ? "Evidence item archived; historical evaluations were preserved."
      : "Evidence item restored.",
  };
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
  const { data: evidenceItem, error: evidenceReadError } = await c.supabase
    .from("attribution_evidence_items")
    .select("archived_at")
    .eq("project_id", p)
    .eq("campaign_id", cid)
    .eq("id", v.data.evidence_item_id)
    .maybeSingle();
  if (evidenceReadError || !evidenceItem)
    return { error: "Hypothesis or evidence item not found." };
  if (evidenceItem.archived_at)
    return { error: "Restore archived evidence before evaluating it." };
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
