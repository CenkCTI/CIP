"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  clusterSchema,
  memberSchema,
  objectFromForm,
  supportSchema,
  type InfrastructureActionResult,
} from "@/lib/infrastructure/schema";
import { requireOwnedProject } from "@/lib/projects/ownership";

const uuidSchema = z.string().uuid();
type OwnedContext = Awaited<ReturnType<typeof requireOwnedProject>>;

function detailPath(projectId: string, clusterId: string) {
  return `/projects/${projectId}/infrastructure/${clusterId}`;
}

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function getOwnedContext(
  projectId: string,
): Promise<OwnedContext | InfrastructureActionResult> {
  if (!uuidSchema.safeParse(projectId).success) {
    return { error: "Investigation not found." };
  }
  try {
    return await requireOwnedProject(projectId);
  } catch {
    return { error: "Investigation not found." };
  }
}

function isActionError<T extends object>(
  value: T | InfrastructureActionResult,
): value is InfrastructureActionResult {
  return "error" in value;
}

async function getOwnedCluster(
  projectId: string,
  clusterId: string,
): Promise<
  | { context: OwnedContext; cluster: { id: string; status: string; pre_archive_status: string | null } }
  | InfrastructureActionResult
> {
  if (!uuidSchema.safeParse(clusterId).success) {
    return { error: "Infrastructure Cluster not found." };
  }
  const context = await getOwnedContext(projectId);
  if (isActionError(context)) return context;

  const { data, error } = await context.supabase
    .from("infrastructure_clusters")
    .select("id,status,pre_archive_status")
    .eq("project_id", context.projectId)
    .eq("id", clusterId)
    .single();
  if (error || !data) return { error: "Infrastructure Cluster not found." };
  return { context, cluster: data };
}

function refresh(projectId: string, clusterId?: string) {
  revalidatePath(`/projects/${projectId}`);
  if (clusterId) revalidatePath(detailPath(projectId, clusterId));
}

export async function createCluster(projectId: string, formData: FormData) {
  const context = await getOwnedContext(projectId);
  if (isActionError(context)) {
    redirectWithError(`/projects/${projectId}?tab=infrastructure`, context.error!);
  }
  const parsed = clusterSchema.safeParse(objectFromForm(formData));
  if (!parsed.success) {
    redirectWithError(
      `/projects/${projectId}?tab=infrastructure`,
      parsed.error.issues[0]?.message ?? "Invalid cluster input.",
    );
  }

  const { data, error } = await context.supabase
    .from("infrastructure_clusters")
    .insert({
      ...parsed.data,
      project_id: context.projectId,
      created_by: context.user.id,
      archived_at: null,
      pre_archive_status: null,
    })
    .select("id")
    .single();
  if (error || !data) {
    redirectWithError(
      `/projects/${projectId}?tab=infrastructure`,
      "Cluster could not be created. Review the values and try again.",
    );
  }
  redirect(detailPath(projectId, data.id));
}

export async function updateCluster(
  projectId: string,
  clusterId: string,
  formData: FormData,
) {
  const owned = await getOwnedCluster(projectId, clusterId);
  const path = detailPath(projectId, clusterId);
  if (isActionError(owned)) redirectWithError(path, owned.error!);

  const parsed = clusterSchema.safeParse(objectFromForm(formData));
  if (!parsed.success) {
    redirectWithError(
      path,
      parsed.error.issues[0]?.message ?? "Invalid cluster input.",
    );
  }
  const archived = owned.cluster.status === "ARCHIVED";
  const update = archived
    ? {
        ...parsed.data,
        status: "ARCHIVED" as const,
        pre_archive_status: parsed.data.status,
      }
    : parsed.data;
  const { data, error } = await owned.context.supabase
    .from("infrastructure_clusters")
    .update(update)
    .eq("project_id", owned.context.projectId)
    .eq("id", clusterId)
    .select("id")
    .single();
  if (error || !data) {
    redirectWithError(path, "Cluster changes could not be saved. Try again.");
  }
  refresh(projectId, clusterId);
  redirect(path);
}

export async function setClusterArchived(
  projectId: string,
  clusterId: string,
  archived: boolean,
) {
  const owned = await getOwnedCluster(projectId, clusterId);
  const path = detailPath(projectId, clusterId);
  if (isActionError(owned)) redirectWithError(path, owned.error!);

  if (archived && owned.cluster.status === "ARCHIVED") redirect(path);
  if (!archived && owned.cluster.status !== "ARCHIVED") redirect(path);

  const restoredStatus = owned.cluster.pre_archive_status;
  if (!archived && !["DRAFT", "ASSESSED", "INACTIVE"].includes(restoredStatus ?? "")) {
    redirectWithError(path, "Cluster archive history is invalid and could not be restored.");
  }
  const values = archived
    ? {
        status: "ARCHIVED" as const,
        archived_at: new Date().toISOString(),
        pre_archive_status: owned.cluster.status,
      }
    : {
        status: restoredStatus,
        archived_at: null,
        pre_archive_status: null,
      };
  const { data, error } = await owned.context.supabase
    .from("infrastructure_clusters")
    .update(values)
    .eq("project_id", owned.context.projectId)
    .eq("id", clusterId)
    .select("id")
    .single();
  if (error || !data) {
    redirectWithError(path, archived ? "Cluster could not be archived." : "Cluster could not be restored.");
  }
  refresh(projectId, clusterId);
  redirect(path);
}

export async function saveMember(
  projectId: string,
  clusterId: string,
  memberId: string | null,
  formData: FormData,
) {
  const owned = await getOwnedCluster(projectId, clusterId);
  const path = detailPath(projectId, clusterId);
  if (isActionError(owned)) redirectWithError(path, owned.error!);
  if (memberId && !uuidSchema.safeParse(memberId).success) {
    redirectWithError(path, "Cluster membership not found.");
  }
  const parsed = memberSchema.safeParse(objectFromForm(formData));
  if (!parsed.success) {
    redirectWithError(path, parsed.error.issues[0]?.message ?? "Invalid membership input.");
  }

  const { data: indicator, error: indicatorError } = await owned.context.supabase
    .from("indicators")
    .select("id")
    .eq("project_id", owned.context.projectId)
    .eq("id", parsed.data.indicator_id)
    .single();
  if (indicatorError || !indicator) {
    redirectWithError(path, "The selected Indicator is not available in this Investigation.");
  }

  const mutation = memberId
    ? owned.context.supabase
        .from("infrastructure_cluster_members")
        .update(parsed.data)
        .eq("project_id", owned.context.projectId)
        .eq("cluster_id", clusterId)
        .eq("id", memberId)
        .select("id")
        .single()
    : owned.context.supabase
        .from("infrastructure_cluster_members")
        .insert({
          ...parsed.data,
          project_id: owned.context.projectId,
          cluster_id: clusterId,
          created_by: owned.context.user.id,
        })
        .select("id")
        .single();
  const { data, error } = await mutation;
  if (error || !data) {
    redirectWithError(
      path,
      memberId
        ? "Membership changes could not be saved."
        : "Membership could not be added. The Indicator may already belong to this cluster.",
    );
  }
  refresh(projectId, clusterId);
  redirect(path);
}

export async function attachSupport(
  projectId: string,
  clusterId: string,
  formData: FormData,
) {
  const owned = await getOwnedCluster(projectId, clusterId);
  const path = detailPath(projectId, clusterId);
  if (isActionError(owned)) redirectWithError(path, owned.error!);
  const parsed = supportSchema.safeParse(objectFromForm(formData));
  if (!parsed.success) redirectWithError(path, "Invalid supporting material selection.");

  if (parsed.data.cluster_member_id) {
    const { data, error } = await owned.context.supabase
      .from("infrastructure_cluster_members")
      .select("id")
      .eq("project_id", owned.context.projectId)
      .eq("cluster_id", clusterId)
      .eq("id", parsed.data.cluster_member_id)
      .single();
    if (error || !data) redirectWithError(path, "Cluster membership not found.");
  }

  const target = {
    source: { table: "sources", label: "Source" },
    evidence: { table: "evidence", label: "Evidence" },
    enrichment: { table: "enrichment_results", label: "Enrichment result" },
  }[parsed.data.kind];
  const { data: targetRecord, error: targetError } = await owned.context.supabase
    .from(target.table)
    .select("id")
    .eq("project_id", owned.context.projectId)
    .eq("id", parsed.data.target_id)
    .single();
  if (targetError || !targetRecord) {
    redirectWithError(path, `${target.label} is not available in this Investigation.`);
  }

  const reference = {
    source_id: parsed.data.kind === "source" ? parsed.data.target_id : null,
    evidence_id: parsed.data.kind === "evidence" ? parsed.data.target_id : null,
    enrichment_result_id:
      parsed.data.kind === "enrichment" ? parsed.data.target_id : null,
  };
  const { data, error } = await owned.context.supabase
    .from("infrastructure_cluster_support")
    .insert({
      ...reference,
      project_id: owned.context.projectId,
      cluster_id: clusterId,
      cluster_member_id: parsed.data.cluster_member_id,
      note: parsed.data.note,
      created_by: owned.context.user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    redirectWithError(path, "Supporting material could not be attached. Try again.");
  }
  refresh(projectId, clusterId);
  redirect(path);
}

export async function unlinkSupport(
  projectId: string,
  clusterId: string,
  supportId: string,
) {
  const owned = await getOwnedCluster(projectId, clusterId);
  const path = detailPath(projectId, clusterId);
  if (isActionError(owned)) redirectWithError(path, owned.error!);
  if (!uuidSchema.safeParse(supportId).success) {
    redirectWithError(path, "Supporting material link not found.");
  }
  const { data, error } = await owned.context.supabase
    .from("infrastructure_cluster_support")
    .delete()
    .eq("project_id", owned.context.projectId)
    .eq("cluster_id", clusterId)
    .eq("id", supportId)
    .select("id")
    .single();
  if (error || !data) {
    redirectWithError(path, "Supporting material could not be unlinked.");
  }
  refresh(projectId, clusterId);
  redirect(path);
}
