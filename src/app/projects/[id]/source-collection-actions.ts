"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  idSchema,
  safeSourceExtension,
  sourceAnnotationCreateSchema,
  sourceFileCancelSchema,
  sourceFileDraftSchema,
  sourceFileFinalizeSchema,
  sourceNoteSchema,
  sourceUrlCreateSchema,
  sourceCollectionLinkSchema,
  sourceAnnotationUpdateSchema,
  urlSourceFormObject,
} from "@/lib/collection/schema";
import { requireOwnedProject } from "@/lib/projects/ownership";

export type SourceCollectionActionState = {
  error?: string;
  success?: string;
  sourceId?: string;
  assetId?: string;
  path?: string;
  token?: string;
};

function refresh(projectId: string, sourceId?: string) {
  revalidatePath(`/projects/${projectId}/collection`);
  revalidatePath(`/projects/${projectId}/sources`);
  if (sourceId) revalidatePath(`/projects/${projectId}/sources/${sourceId}`);
}

async function verifyIds(
  context: Awaited<ReturnType<typeof requireOwnedProject>>,
  table: "investigation_information_gaps" | "collection_requirements",
  ids: string[],
) {
  if (!ids.length) return true;
  const unique = [...new Set(ids)];
  const { data, error } = await context.supabase
    .from(table)
    .select("id")
    .eq("project_id", context.projectId)
    .in("id", unique);
  return !error && (data?.length ?? 0) === unique.length;
}

async function replaceSourceLinks(
  context: Awaited<ReturnType<typeof requireOwnedProject>>,
  sourceId: string,
  gapIds: string[],
  requirementIds: string[],
) {
  if (
    !(await verifyIds(context, "investigation_information_gaps", gapIds)) ||
    !(await verifyIds(context, "collection_requirements", requirementIds))
  ) {
    return { error: "Seçilen gap veya collection requirement bu Investigation'a ait değil." };
  }

  const [gapDelete, requirementDelete] = await Promise.all([
    context.supabase
      .from("source_gap_links")
      .delete()
      .eq("project_id", context.projectId)
      .eq("source_id", sourceId),
    context.supabase
      .from("source_requirement_links")
      .delete()
      .eq("project_id", context.projectId)
      .eq("source_id", sourceId),
  ]);
  if (gapDelete.error || requirementDelete.error) {
    return { error: "Kaynak bağlantıları güncellenemedi." };
  }

  const uniqueGaps = [...new Set(gapIds)];
  const uniqueRequirements = [...new Set(requirementIds)];
  const inserts = [];
  if (uniqueGaps.length) {
    inserts.push(
      context.supabase.from("source_gap_links").insert(
        uniqueGaps.map((gap_id) => ({
          project_id: context.projectId,
          source_id: sourceId,
          gap_id,
          created_by: context.user.id,
        })),
      ),
    );
  }
  if (uniqueRequirements.length) {
    inserts.push(
      context.supabase.from("source_requirement_links").insert(
        uniqueRequirements.map((requirement_id) => ({
          project_id: context.projectId,
          source_id: sourceId,
          requirement_id,
          created_by: context.user.id,
        })),
      ),
    );
  }
  const results = await Promise.all(inserts);
  return results.some((result) => result.error)
    ? { error: "Kaynak bağlantılarından biri kaydedilemedi." }
    : {};
}

async function replaceAnnotationLinks(
  context: Awaited<ReturnType<typeof requireOwnedProject>>,
  annotationId: string,
  gapIds: string[],
  requirementIds: string[],
) {
  if (
    !(await verifyIds(context, "investigation_information_gaps", gapIds)) ||
    !(await verifyIds(context, "collection_requirements", requirementIds))
  ) {
    return { error: "Annotation bağlantısı başka bir Investigation kaydına işaret ediyor." };
  }

  const [gapDelete, requirementDelete] = await Promise.all([
    context.supabase
      .from("source_annotation_gap_links")
      .delete()
      .eq("project_id", context.projectId)
      .eq("annotation_id", annotationId),
    context.supabase
      .from("source_annotation_requirement_links")
      .delete()
      .eq("project_id", context.projectId)
      .eq("annotation_id", annotationId),
  ]);
  if (gapDelete.error || requirementDelete.error) {
    return { error: "Annotation bağlantıları güncellenemedi." };
  }

  const inserts = [];
  const uniqueGaps = [...new Set(gapIds)];
  const uniqueRequirements = [...new Set(requirementIds)];
  if (uniqueGaps.length) {
    inserts.push(
      context.supabase.from("source_annotation_gap_links").insert(
        uniqueGaps.map((gap_id) => ({
          project_id: context.projectId,
          annotation_id: annotationId,
          gap_id,
          created_by: context.user.id,
        })),
      ),
    );
  }
  if (uniqueRequirements.length) {
    inserts.push(
      context.supabase.from("source_annotation_requirement_links").insert(
        uniqueRequirements.map((requirement_id) => ({
          project_id: context.projectId,
          annotation_id: annotationId,
          requirement_id,
          created_by: context.user.id,
        })),
      ),
    );
  }
  const results = await Promise.all(inserts);
  return results.some((result) => result.error)
    ? { error: "Annotation bağlantılarından biri kaydedilemedi." }
    : {};
}

export async function createCollectionUrlSource(
  projectId: string,
  _state: SourceCollectionActionState,
  formData: FormData,
): Promise<SourceCollectionActionState> {
  try {
    const context = await requireOwnedProject(projectId);
    const parsed = sourceUrlCreateSchema.safeParse(urlSourceFormObject(formData));
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz kaynak." };
    }
    const { gap_ids, requirement_ids, ...source } = parsed.data;
    if (
      !(await verifyIds(context, "investigation_information_gaps", gap_ids)) ||
      !(await verifyIds(context, "collection_requirements", requirement_ids))
    ) {
      return { error: "Seçilen gap veya collection requirement bu Investigation'a ait değil." };
    }

    const { data, error } = await context.supabase
      .from("sources")
      .insert({
        ...source,
        project_id: context.projectId,
        reliability: "UNKNOWN",
        verification_state: "UNVERIFIED",
        origin_kind: "ANALYST",
        accessed_at: new Date().toISOString(),
        created_by: context.user.id,
      })
      .select("id")
      .single();
    if (error || !data) return { error: "Kaynak oluşturulamadı." };

    const linked = await replaceSourceLinks(context, data.id, gap_ids, requirement_ids);
    if (linked.error) {
      await context.supabase
        .from("sources")
        .delete()
        .eq("project_id", context.projectId)
        .eq("id", data.id);
      return linked;
    }
    refresh(context.projectId, data.id);
    return { success: "URL kaynağı toplandı.", sourceId: data.id };
  } catch {
    return { error: "Investigation bulunamadı." };
  }
}

export async function prepareCollectionFileSource(
  projectId: string,
  input: unknown,
): Promise<SourceCollectionActionState> {
  try {
    const context = await requireOwnedProject(projectId);
    const parsed = sourceFileDraftSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz kaynak dosyası." };
    }
    if (
      !(await verifyIds(context, "investigation_information_gaps", parsed.data.gap_ids)) ||
      !(await verifyIds(context, "collection_requirements", parsed.data.requirement_ids))
    ) {
      return { error: "Seçilen gap veya collection requirement bu Investigation'a ait değil." };
    }

    const sourceId = randomUUID();
    const assetId = randomUUID();
    const extension = safeSourceExtension(parsed.data.file_name);
    const storagePath =
      `${context.user.id}/${context.projectId}/${sourceId}/${assetId}${extension}`;

    const { gap_ids, requirement_ids, file_name, file_size, mime_type, sha256, ...source } =
      parsed.data;
    const { error: sourceError } = await context.supabase.from("sources").insert({
      id: sourceId,
      ...source,
      project_id: context.projectId,
      reliability: "UNKNOWN",
      verification_state: "UNVERIFIED",
      origin_kind: "ANALYST",
      accessed_at: new Date().toISOString(),
      created_by: context.user.id,
    });
    if (sourceError) return { error: "Kaynak kaydı oluşturulamadı." };

    const linked = await replaceSourceLinks(context, sourceId, gap_ids, requirement_ids);
    if (linked.error) {
      await context.supabase
        .from("sources")
        .delete()
        .eq("project_id", context.projectId)
        .eq("id", sourceId);
      return linked;
    }

    const { error: assetError } = await context.supabase.from("source_assets").insert({
      id: assetId,
      project_id: context.projectId,
      source_id: sourceId,
      asset_role: "ORIGINAL",
      state: "PENDING",
      original_filename: file_name,
      mime_type: mime_type || null,
      size_bytes: file_size,
      sha256,
      storage_path: storagePath,
      created_by: context.user.id,
    });
    if (assetError) {
      await context.supabase
        .from("sources")
        .delete()
        .eq("project_id", context.projectId)
        .eq("id", sourceId);
      return { error: "Kaynak dosyası için asset kaydı oluşturulamadı." };
    }

    const { data: signed, error: signError } = await context.supabase.storage
      .from("source-assets")
      .createSignedUploadUrl(storagePath);
    if (signError || !signed?.token) {
      await context.supabase
        .from("source_assets")
        .delete()
        .eq("project_id", context.projectId)
        .eq("id", assetId);
      await context.supabase
        .from("sources")
        .delete()
        .eq("project_id", context.projectId)
        .eq("id", sourceId);
      return { error: "Kaynak dosyası için güvenli yükleme URL'si oluşturulamadı." };
    }

    return {
      success: "Dosya yüklemesi hazır.",
      sourceId,
      assetId,
      path: storagePath,
      token: signed.token,
    };
  } catch {
    return { error: "Investigation bulunamadı." };
  }
}

export async function finalizeCollectionFileSource(
  projectId: string,
  input: unknown,
): Promise<SourceCollectionActionState> {
  try {
    const context = await requireOwnedProject(projectId);
    const parsed = sourceFileFinalizeSchema.safeParse(input);
    if (!parsed.success) return { error: "Dosya finalization verisi geçersiz." };
    const expectedPrefix = `${context.user.id}/${context.projectId}/${parsed.data.source_id}/`;
    if (!parsed.data.storage_path.startsWith(expectedPrefix)) {
      return { error: "Kaynak asset path'i Investigation ile eşleşmiyor." };
    }

    const { data: asset, error: assetReadError } = await context.supabase
      .from("source_assets")
      .select("id,source_id,state,storage_path")
      .eq("project_id", context.projectId)
      .eq("id", parsed.data.asset_id)
      .eq("source_id", parsed.data.source_id)
      .single();
    if (
      assetReadError ||
      !asset ||
      asset.state !== "PENDING" ||
      asset.storage_path !== parsed.data.storage_path
    ) {
      return { error: "Bekleyen source asset bulunamadı." };
    }

    const { error } = await context.supabase
      .from("source_assets")
      .update({
        state: "READY",
        sha256: parsed.data.sha256,
        size_bytes: parsed.data.file_size,
        mime_type: parsed.data.mime_type || null,
        ready_at: new Date().toISOString(),
      })
      .eq("project_id", context.projectId)
      .eq("id", parsed.data.asset_id)
      .eq("source_id", parsed.data.source_id);
    if (error) {
      return { error: "Dosya yüklendi ancak source asset finalize edilemedi." };
    }
    refresh(context.projectId, parsed.data.source_id);
    return { success: "Dosya kaynağı toplandı.", sourceId: parsed.data.source_id };
  } catch {
    return { error: "Investigation bulunamadı." };
  }
}

export async function cancelCollectionFileSource(
  projectId: string,
  input: unknown,
): Promise<SourceCollectionActionState> {
  try {
    const context = await requireOwnedProject(projectId);
    const parsed = sourceFileCancelSchema.safeParse(input);
    if (!parsed.success) return { error: "Geçersiz upload iptal isteği." };
    const expectedPrefix = `${context.user.id}/${context.projectId}/${parsed.data.source_id}/`;
    if (!parsed.data.storage_path.startsWith(expectedPrefix)) {
      return { error: "Geçersiz source asset path'i." };
    }
    await context.supabase.storage.from("source-assets").remove([parsed.data.storage_path]);
    await context.supabase
      .from("source_assets")
      .delete()
      .eq("project_id", context.projectId)
      .eq("source_id", parsed.data.source_id)
      .eq("id", parsed.data.asset_id)
      .eq("state", "PENDING");
    await context.supabase
      .from("sources")
      .delete()
      .eq("project_id", context.projectId)
      .eq("id", parsed.data.source_id);
    refresh(context.projectId);
    return { success: "Tamamlanmamış source upload temizlendi." };
  } catch {
    return { error: "Investigation bulunamadı." };
  }
}

export async function updateSourceCollectionLinks(
  projectId: string,
  input: unknown,
): Promise<SourceCollectionActionState> {
  try {
    const context = await requireOwnedProject(projectId);
    const parsed = sourceCollectionLinkSchema.safeParse(input);
    if (!parsed.success) return { error: "Kaynak bağlantıları geçersiz." };
    const { data: source } = await context.supabase
      .from("sources")
      .select("id")
      .eq("project_id", context.projectId)
      .eq("id", parsed.data.source_id)
      .single();
    if (!source) return { error: "Kaynak bulunamadı." };
    const result = await replaceSourceLinks(
      context,
      parsed.data.source_id,
      parsed.data.gap_ids,
      parsed.data.requirement_ids,
    );
    if (result.error) return result;
    refresh(context.projectId, parsed.data.source_id);
    return { success: "Kaynak collection context'i güncellendi." };
  } catch {
    return { error: "Investigation bulunamadı." };
  }
}

export async function createSourceNote(
  projectId: string,
  sourceId: string,
  _state: SourceCollectionActionState,
  formData: FormData,
): Promise<SourceCollectionActionState> {
  try {
    const context = await requireOwnedProject(projectId);
    const parsed = sourceNoteSchema.safeParse({
      source_id: sourceId,
      body: formData.get("body"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz analyst note." };
    }
    const { data: source } = await context.supabase
      .from("sources")
      .select("id")
      .eq("project_id", context.projectId)
      .eq("id", parsed.data.source_id)
      .single();
    if (!source) return { error: "Kaynak bulunamadı." };

    const { data: tail } = await context.supabase
      .from("source_notes")
      .select("sort_order")
      .eq("project_id", context.projectId)
      .eq("source_id", parsed.data.source_id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await context.supabase.from("source_notes").insert({
      project_id: context.projectId,
      source_id: parsed.data.source_id,
      body: parsed.data.body,
      sort_order: Number(tail?.sort_order ?? 0) + 10,
      created_by: context.user.id,
    });
    if (error) return { error: "Analist notu kaydedilemedi." };
    refresh(context.projectId, parsed.data.source_id);
    return { success: "Analist notu eklendi." };
  } catch {
    return { error: "Investigation bulunamadı." };
  }
}

export async function deleteSourceNote(
  projectId: string,
  sourceId: string,
  noteId: string,
): Promise<SourceCollectionActionState> {
  try {
    const note = idSchema.safeParse(noteId);
    const source = idSchema.safeParse(sourceId);
    if (!note.success || !source.success) return { error: "Not bulunamadı." };
    const context = await requireOwnedProject(projectId);
    const { error } = await context.supabase
      .from("source_notes")
      .delete()
      .eq("project_id", context.projectId)
      .eq("source_id", source.data)
      .eq("id", note.data);
    if (error) return { error: "Not silinemedi." };
    refresh(context.projectId, source.data);
    return { success: "Not silindi." };
  } catch {
    return { error: "Investigation bulunamadı." };
  }
}

export async function createSourceAnnotation(
  projectId: string,
  input: unknown,
): Promise<SourceCollectionActionState> {
  try {
    const context = await requireOwnedProject(projectId);
    const parsed = sourceAnnotationCreateSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz annotation." };
    }
    const { gap_ids, requirement_ids, ...annotation } = parsed.data;
    if (
      !(await verifyIds(context, "investigation_information_gaps", gap_ids)) ||
      !(await verifyIds(context, "collection_requirements", requirement_ids))
    ) {
      return { error: "Annotation context'i başka bir Investigation'a ait." };
    }
    const { data: asset, error: assetError } = await context.supabase
      .from("source_assets")
      .select("id,source_id,state")
      .eq("project_id", context.projectId)
      .eq("id", annotation.asset_id)
      .eq("source_id", annotation.source_id)
      .single();
    if (assetError || !asset || asset.state !== "READY") {
      return { error: "Annotation için hazır source asset bulunamadı." };
    }

    const { data, error } = await context.supabase
      .from("source_annotations")
      .insert({
        ...annotation,
        project_id: context.projectId,
        created_by: context.user.id,
      })
      .select("id")
      .single();
    if (error || !data) return { error: "Annotation kaydedilemedi." };

    const linked = await replaceAnnotationLinks(
      context,
      data.id,
      gap_ids,
      requirement_ids,
    );
    if (linked.error) {
      await context.supabase
        .from("source_annotations")
        .delete()
        .eq("project_id", context.projectId)
        .eq("id", data.id);
      return linked;
    }
    refresh(context.projectId, annotation.source_id);
    return { success: "Annotation kaydedildi." };
  } catch {
    return { error: "Investigation bulunamadı." };
  }
}

export async function updateSourceAnnotationContext(
  projectId: string,
  sourceId: string,
  annotationId: string,
  input: unknown,
): Promise<SourceCollectionActionState> {
  try {
    const source = idSchema.safeParse(sourceId);
    const annotation = idSchema.safeParse(annotationId);
    const parsed = sourceAnnotationUpdateSchema.safeParse(input);
    if (!source.success || !annotation.success || !parsed.success) {
      return { error: "Geçersiz annotation güncellemesi." };
    }
    const context = await requireOwnedProject(projectId);
    const { data, error } = await context.supabase
      .from("source_annotations")
      .update({ comment: parsed.data.comment })
      .eq("project_id", context.projectId)
      .eq("source_id", source.data)
      .eq("id", annotation.data)
      .select("id")
      .single();
    if (error || !data) return { error: "Annotation bulunamadı." };
    const linked = await replaceAnnotationLinks(
      context,
      annotation.data,
      parsed.data.gap_ids,
      parsed.data.requirement_ids,
    );
    if (linked.error) return linked;
    refresh(context.projectId, source.data);
    return { success: "Annotation context'i güncellendi." };
  } catch {
    return { error: "Investigation bulunamadı." };
  }
}

export async function deleteSourceAnnotation(
  projectId: string,
  sourceId: string,
  annotationId: string,
): Promise<SourceCollectionActionState> {
  try {
    const source = idSchema.safeParse(sourceId);
    const annotation = idSchema.safeParse(annotationId);
    if (!source.success || !annotation.success) return { error: "Annotation bulunamadı." };
    const context = await requireOwnedProject(projectId);
    const { error } = await context.supabase
      .from("source_annotations")
      .delete()
      .eq("project_id", context.projectId)
      .eq("source_id", source.data)
      .eq("id", annotation.data);
    if (error) return { error: "Annotation silinemedi." };
    refresh(context.projectId, source.data);
    return { success: "Annotation silindi." };
  } catch {
    return { error: "Investigation bulunamadı." };
  }
}

export async function getSourceAssetSignedUrl(
  projectId: string,
  sourceId: string,
  assetId: string,
) {
  try {
    const source = idSchema.safeParse(sourceId);
    const asset = idSchema.safeParse(assetId);
    if (!source.success || !asset.success) return { error: "Source asset bulunamadı." };
    const context = await requireOwnedProject(projectId);
    const { data: row, error } = await context.supabase
      .from("source_assets")
      .select("storage_path,state")
      .eq("project_id", context.projectId)
      .eq("source_id", source.data)
      .eq("id", asset.data)
      .single();
    if (error || !row || row.state !== "READY") return { error: "Source asset hazır değil." };
    const { data, error: signError } = await context.supabase.storage
      .from("source-assets")
      .createSignedUrl(row.storage_path, 15 * 60);
    if (signError || !data?.signedUrl) return { error: "Source asset URL'si üretilemedi." };
    return { url: data.signedUrl };
  } catch {
    return { error: "Investigation bulunamadı." };
  }
}

export async function recordSourcePrintExport(
  projectId: string,
  sourceId: string,
  assetId: string | null,
): Promise<SourceCollectionActionState> {
  try {
    const source = idSchema.safeParse(sourceId);
    const asset = assetId ? idSchema.safeParse(assetId) : null;
    if (!source.success || (asset && !asset.success)) {
      return { error: "Kaynak veya asset bulunamadı." };
    }
    const context = await requireOwnedProject(projectId);
    const [annotationCount, noteCount, assetRow] = await Promise.all([
      context.supabase
        .from("source_annotations")
        .select("id", { count: "exact", head: true })
        .eq("project_id", context.projectId)
        .eq("source_id", source.data),
      context.supabase
        .from("source_notes")
        .select("id", { count: "exact", head: true })
        .eq("project_id", context.projectId)
        .eq("source_id", source.data),
      asset?.success
        ? context.supabase
            .from("source_assets")
            .select("id,sha256")
            .eq("project_id", context.projectId)
            .eq("source_id", source.data)
            .eq("id", asset.data)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (annotationCount.error || noteCount.error || assetRow.error) {
      return { error: "Export audit bilgisi hazırlanamadı." };
    }
    const { error } = await context.supabase.from("source_export_events").insert({
      project_id: context.projectId,
      source_id: source.data,
      asset_id: asset?.success ? asset.data : null,
      export_kind: "PRINT_PACKET",
      annotation_count: annotationCount.count ?? 0,
      note_count: noteCount.count ?? 0,
      source_sha256: assetRow.data?.sha256 ?? null,
      created_by: context.user.id,
    });
    if (error) return { error: "Export audit kaydı yazılamadı." };
    return { success: "Export çalışma kopyası kaydedildi." };
  } catch {
    return { error: "Investigation bulunamadı." };
  }
}
