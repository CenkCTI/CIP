"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  collectionRequirementSchema,
  collectionRequirementUpdateSchema,
  idSchema,
  requirementFormObject,
  requirementUpdateFormObject,
} from "@/lib/collection/schema";
import { requireOwnedProject } from "@/lib/projects/ownership";

export type CollectionActionState = { error?: string; success?: string };

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}/collection`);
  revalidatePath(`/projects/${projectId}/sources`);
  revalidatePath(`/projects/${projectId}`);
}

async function verifyGaps(
  context: Awaited<ReturnType<typeof requireOwnedProject>>,
  ids: string[],
) {
  if (!ids.length) return true;
  const unique = [...new Set(ids)];
  const { data, error } = await context.supabase
    .from("investigation_information_gaps")
    .select("id")
    .eq("project_id", context.projectId)
    .in("id", unique);
  return !error && (data?.length ?? 0) === unique.length;
}

async function replaceRequirementGapLinks(
  context: Awaited<ReturnType<typeof requireOwnedProject>>,
  requirementId: string,
  gapIds: string[],
) {
  if (!(await verifyGaps(context, gapIds))) {
    return { error: "Seçilen bilgi açıklarından biri bu Investigation'a ait değil." };
  }
  const { error: deleteError } = await context.supabase
    .from("collection_requirement_gap_links")
    .delete()
    .eq("project_id", context.projectId)
    .eq("requirement_id", requirementId);
  if (deleteError) return { error: "Bilgi açığı bağlantıları güncellenemedi." };

  const unique = [...new Set(gapIds)];
  if (!unique.length) return {};
  const { error } = await context.supabase
    .from("collection_requirement_gap_links")
    .insert(
      unique.map((gap_id) => ({
        project_id: context.projectId,
        requirement_id: requirementId,
        gap_id,
        created_by: context.user.id,
      })),
    );
  return error ? { error: "Bilgi açığı bağlantıları kaydedilemedi." } : {};
}

export async function createCollectionRequirement(
  projectId: string,
  _state: CollectionActionState,
  formData: FormData,
): Promise<CollectionActionState> {
  try {
    const context = await requireOwnedProject(projectId);
    const parsed = collectionRequirementSchema.safeParse(requirementFormObject(formData));
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz collection requirement." };
    }
    if (!(await verifyGaps(context, parsed.data.gap_ids))) {
      return { error: "Seçilen bilgi açığı bu Investigation'a ait değil." };
    }

    const { data: tail } = await context.supabase
      .from("collection_requirements")
      .select("sort_order")
      .eq("project_id", context.projectId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await context.supabase
      .from("collection_requirements")
      .insert({
        project_id: context.projectId,
        requirement: parsed.data.requirement,
        rationale: parsed.data.rationale,
        priority: parsed.data.priority,
        status: "OPEN",
        sort_order: Number(tail?.sort_order ?? 0) + 10,
        created_by: context.user.id,
      })
      .select("id")
      .single();
    if (error || !data) return { error: "Collection requirement oluşturulamadı." };

    const linked = await replaceRequirementGapLinks(
      context,
      data.id,
      parsed.data.gap_ids,
    );
    if (linked.error) {
      await context.supabase
        .from("collection_requirements")
        .delete()
        .eq("project_id", context.projectId)
        .eq("id", data.id);
      return linked;
    }

    refresh(context.projectId);
    return { success: "Collection requirement oluşturuldu." };
  } catch {
    return { error: "Investigation bulunamadı." };
  }
}

export async function updateCollectionRequirement(
  projectId: string,
  requirementId: string,
  _state: CollectionActionState,
  formData: FormData,
): Promise<CollectionActionState> {
  try {
    const id = idSchema.safeParse(requirementId);
    if (!id.success) return { error: "Collection requirement bulunamadı." };
    const context = await requireOwnedProject(projectId);
    const parsed = collectionRequirementUpdateSchema.safeParse(
      requirementUpdateFormObject(formData),
    );
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz collection requirement." };
    }
    if (!(await verifyGaps(context, parsed.data.gap_ids))) {
      return { error: "Seçilen bilgi açığı bu Investigation'a ait değil." };
    }

    const now = new Date().toISOString();
    const { data, error } = await context.supabase
      .from("collection_requirements")
      .update({
        requirement: parsed.data.requirement,
        rationale: parsed.data.rationale,
        priority: parsed.data.priority,
        status: parsed.data.status,
        satisfied_at: parsed.data.status === "SATISFIED" ? now : null,
        stopped_at: parsed.data.status === "STOPPED" ? now : null,
      })
      .eq("project_id", context.projectId)
      .eq("id", id.data)
      .select("id")
      .single();
    if (error || !data) return { error: "Collection requirement güncellenemedi." };

    const linked = await replaceRequirementGapLinks(
      context,
      id.data,
      parsed.data.gap_ids,
    );
    if (linked.error) return linked;
    refresh(context.projectId);
    return { success: "Collection requirement güncellendi." };
  } catch {
    return { error: "Investigation bulunamadı." };
  }
}

export async function setCollectionRequirementStatus(
  projectId: string,
  requirementId: string,
  status: string,
): Promise<CollectionActionState> {
  try {
    const id = idSchema.safeParse(requirementId);
    const parsedStatus = z
      .enum(["OPEN", "COLLECTING", "SATISFIED", "STOPPED"])
      .safeParse(status);
    if (!id.success || !parsedStatus.success) {
      return { error: "Geçersiz collection requirement durumu." };
    }
    const context = await requireOwnedProject(projectId);
    const now = new Date().toISOString();
    const { data, error } = await context.supabase
      .from("collection_requirements")
      .update({
        status: parsedStatus.data,
        satisfied_at: parsedStatus.data === "SATISFIED" ? now : null,
        stopped_at: parsedStatus.data === "STOPPED" ? now : null,
      })
      .eq("project_id", context.projectId)
      .eq("id", id.data)
      .select("id")
      .single();
    if (error || !data) return { error: "Collection requirement durumu güncellenemedi." };
    refresh(context.projectId);
    return {
      success:
        parsedStatus.data === "SATISFIED"
          ? "Analist mevcut collection ihtiyacını yeterli gördü."
          : "Collection requirement durumu güncellendi.",
    };
  } catch {
    return { error: "Investigation bulunamadı." };
  }
}

export async function deleteCollectionRequirement(
  projectId: string,
  requirementId: string,
): Promise<CollectionActionState> {
  try {
    const id = idSchema.safeParse(requirementId);
    if (!id.success) return { error: "Collection requirement bulunamadı." };
    const context = await requireOwnedProject(projectId);
    const { error } = await context.supabase
      .from("collection_requirements")
      .delete()
      .eq("project_id", context.projectId)
      .eq("id", id.data);
    if (error) return { error: "Collection requirement silinemedi." };
    refresh(context.projectId);
    return { success: "Collection requirement silindi." };
  } catch {
    return { error: "Investigation bulunamadı." };
  }
}
