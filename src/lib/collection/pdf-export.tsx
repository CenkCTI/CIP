import "server-only";

import { createHash, randomUUID } from "node:crypto";
import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import {
  burnAnnotationsIntoPdf,
  mergePdfBytes,
  orderAnnotations,
} from "@/lib/collection/pdf-burn-in";
import {
  CITEM_PDF_FONT_FAMILY,
  ensureCitemPdfFonts,
} from "@/lib/collection/pdf-fonts";
import { requireOwnedProject } from "@/lib/projects/ownership";

type Row = Record<string, unknown>;

const s = (value: unknown) => String(value ?? "");
const STABLE_PDF_DATE = new Date("2000-01-01T00:00:00.000Z");

const styles = StyleSheet.create({
  page: {
    padding: 38,
    fontSize: 9.5,
    lineHeight: 1.45,
    color: "#1c1917",
    fontFamily: CITEM_PDF_FONT_FAMILY,
  },
  brand: { fontSize: 10, letterSpacing: 3, color: "#9a651f", marginBottom: 18 },
  title: { fontSize: 24, fontWeight: 700, marginBottom: 8 },
  subtitle: { fontSize: 11, color: "#57534e", marginBottom: 22 },
  heading: { fontSize: 12, fontWeight: 700, marginTop: 14, marginBottom: 6, color: "#7c4a12" },
  box: { borderWidth: 1, borderColor: "#d6d3d1", padding: 10, marginBottom: 9 },
  label: { fontSize: 7.5, color: "#78716c", textTransform: "uppercase", letterSpacing: 1 },
  value: { fontSize: 9.5, marginTop: 2 },
  note: { fontSize: 9, marginBottom: 6 },
  link: { fontSize: 8, color: "#57534e", marginTop: 3 },
  disclaimer: { fontSize: 7.5, color: "#78716c", marginTop: 18 },
  pageNo: { position: "absolute", right: 38, bottom: 22, fontSize: 7, color: "#a8a29e" },
});

function date(value: unknown) {
  if (!value) return "Belirtilmedi";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "Belirtilmedi" : parsed.toISOString().slice(0, 10);
}

function truncate(value: string, max = 450) {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function safeFilename(title: string) {
  const stem =
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 90) || "kaynak";
  return `CITEM_${stem}_isaretli.pdf`;
}

function annotationTypeLabel(value: unknown) {
  if (value === "HIGHLIGHT") return "Vurgulama";
  if (value === "UNDERLINE") return "Altını çizme";
  if (value === "REGION") return "Bölge";
  return s(value);
}

function FrontMatter({
  project,
  source,
  asset,
  gaps,
  requirements,
  notes,
  annotations,
  fragments,
  annotationGapLinks,
  annotationRequirementLinks,
}: {
  project: Row;
  source: Row;
  asset: Row;
  gaps: Row[];
  requirements: Row[];
  notes: Row[];
  annotations: Row[];
  fragments: Row[];
  annotationGapLinks: Row[];
  annotationRequirementLinks: Row[];
}) {
  const ordered = orderAnnotations(annotations, fragments);
  const fragmentsByAnnotation = new Map<string, Row[]>();
  const gapById = new Map(gaps.map((gap) => [s(gap.id), gap]));
  const requirementById = new Map(requirements.map((requirement) => [s(requirement.id), requirement]));
  const gapIdsByAnnotation = new Map<string, string[]>();
  const requirementIdsByAnnotation = new Map<string, string[]>();

  for (const fragment of fragments) {
    const id = s(fragment.annotation_id);
    fragmentsByAnnotation.set(id, [...(fragmentsByAnnotation.get(id) ?? []), fragment]);
  }
  for (const link of annotationGapLinks) {
    const id = s(link.annotation_id);
    gapIdsByAnnotation.set(id, [...(gapIdsByAnnotation.get(id) ?? []), s(link.gap_id)]);
  }
  for (const link of annotationRequirementLinks) {
    const id = s(link.annotation_id);
    requirementIdsByAnnotation.set(id, [
      ...(requirementIdsByAnnotation.get(id) ?? []),
      s(link.requirement_id),
    ]);
  }

  return (
    <Document
      title={`CİTEM - ${s(source.title)}`}
      creator="BAYKUSH / CİTEM"
      producer="BAYKUSH / CİTEM"
      creationDate={STABLE_PDF_DATE}
      modificationDate={STABLE_PDF_DATE}
    >
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.brand}>BAYKUSH / CİTEM</Text>
        <Text style={styles.title}>KAYNAK ÇALIŞMA KOPYASI</Text>
        <Text style={styles.subtitle}>İşaretli ve izlenebilir analist çalışma çıktısı</Text>

        <View style={styles.box}>
          <Text style={styles.label}>Araştırma</Text>
          <Text style={styles.value}>{s(project.name)}</Text>
          <Text style={styles.value}>{s(project.research_question)}</Text>
        </View>

        <View style={styles.box}>
          <Text style={styles.label}>Kaynak</Text>
          <Text style={styles.value}>{s(source.title)}</Text>
          <Text style={styles.value}>
            {s(source.publisher) || "Yayıncı belirtilmedi"} · {date(source.published_at)}
          </Text>
        </View>

        <Text style={styles.heading}>Toplama Bağlamı</Text>
        <Text>{s(source.collection_rationale) || "Toplama nedeni kaydedilmemiş."}</Text>

        <Text style={styles.heading}>Bilgi Açıkları</Text>
        {gaps.length ? (
          gaps.map((gap) => (
            <Text key={s(gap.id)} style={styles.note}>
              - {s(gap.description)}
            </Text>
          ))
        ) : (
          <Text>Bağlı bilgi açığı yok.</Text>
        )}

        <Text style={styles.heading}>Toplama Gereksinimleri</Text>
        {requirements.length ? (
          requirements.map((requirement) => (
            <Text key={s(requirement.id)} style={styles.note}>
              - {s(requirement.requirement)}
            </Text>
          ))
        ) : (
          <Text>Bağlı toplama gereksinimi yok.</Text>
        )}

        <Text style={styles.heading}>Kaynak Köken Bilgisi</Text>
        <Text style={styles.note}>Kaynak Kimliği: {s(source.id)}</Text>
        <Text style={styles.note}>Dosya Kimliği: {s(asset.id)}</Text>
        <Text style={styles.note}>Orijinal dosya: {s(asset.original_filename)}</Text>
        <Text style={styles.note}>SHA-256: {s(asset.sha256) || "—"}</Text>
        <Text style={styles.note}>Orijinal URL: {s(source.url) || "—"}</Text>

        <Text style={styles.disclaimer}>
          Bu belge CİTEM içinde analist tarafından oluşturulan işaretlemeler ve notlar
          içeren türetilmiş çalışma kopyasıdır. Orijinal kaynak değiştirilmeden ayrıca
          muhafaza edilmektedir.
        </Text>
        <Text
          fixed
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          style={styles.pageNo}
        />
      </Page>

      {notes.length || ordered.length ? (
        <Page size="A4" style={styles.page} wrap>
          <Text style={styles.brand}>BAYKUSH / CİTEM</Text>
          <Text style={styles.title}>ANALİST NOTLARI VE İŞARETLEME DİZİNİ</Text>

          {notes.length ? (
            <>
              <Text style={styles.heading}>Kaynak Notları</Text>
              {notes.map((note, index) => (
                <View key={s(note.id)} style={styles.box}>
                  <Text style={styles.label}>Not {index + 1}</Text>
                  <Text style={styles.value}>{s(note.body)}</Text>
                </View>
              ))}
            </>
          ) : null}

          {ordered.length ? (
            <>
              <Text style={styles.heading}>İşaretleme Dizini</Text>
              {ordered.map((annotation, index) => {
                const annotationId = s(annotation.id);
                const annotationFragments = fragmentsByAnnotation.get(annotationId) ?? [];
                const sourcePage = Number(
                  annotationFragments[0]?.page_number ?? annotation.page_number ?? 0,
                );
                const legacy = Number(annotation.geometry_version) !== 2;
                const linkedGapIds = gapIdsByAnnotation.get(annotationId) ?? [];
                const linkedRequirementIds = requirementIdsByAnnotation.get(annotationId) ?? [];

                return (
                  <View key={annotationId} style={styles.box}>
                    <Text style={styles.label}>
                      {index + 1}. işaretleme · Kaynak s. {sourcePage || "—"} ·{" "}
                      {annotationTypeLabel(annotation.annotation_type)}
                    </Text>
                    {annotation.selected_text ? (
                      <Text style={styles.value}>
                        Seçilen metin: {truncate(s(annotation.selected_text))}
                      </Text>
                    ) : null}
                    {annotation.comment ? (
                      <Text style={styles.value}>Analist notu: {s(annotation.comment)}</Text>
                    ) : null}
                    {linkedGapIds.map((gapId) => (
                      <Text key={gapId} style={styles.link}>
                        Bilgi Açığı: {s(gapById.get(gapId)?.description) || gapId}
                      </Text>
                    ))}
                    {linkedRequirementIds.map((requirementId) => (
                      <Text key={requirementId} style={styles.link}>
                        Toplama Gereksinimi:{" "}
                        {s(requirementById.get(requirementId)?.requirement) || requirementId}
                      </Text>
                    ))}
                    {legacy ? (
                      <Text style={styles.disclaimer}>
                        Eski ekran-koordinatı işaretlemesi: kaynak PDF üzerine işlenmedi.
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </>
          ) : null}

          <Text
            fixed
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
            style={styles.pageNo}
          />
        </Page>
      ) : null}
    </Document>
  );
}

export class SourcePdfExportError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
  ) {
    super(message);
  }
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map(s).filter(Boolean))].sort();
}

export async function generateAnnotatedSourcePdf(projectId: string, sourceId: string) {
  ensureCitemPdfFonts();
  const context = await requireOwnedProject(projectId);
  const [
    projectResult,
    sourceResult,
    assetResult,
    sourceGapLinksResult,
    sourceRequirementLinksResult,
    notesResult,
    annotationsResult,
    fragmentsResult,
  ] = await Promise.all([
    context.supabase
      .from("projects")
      .select("id,name,research_question")
      .eq("id", context.projectId)
      .single(),
    context.supabase
      .from("sources")
      .select("*")
      .eq("project_id", context.projectId)
      .eq("id", sourceId)
      .single(),
    context.supabase
      .from("source_assets")
      .select("*")
      .eq("project_id", context.projectId)
      .eq("source_id", sourceId)
      .eq("asset_role", "ORIGINAL")
      .eq("state", "READY")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    context.supabase
      .from("source_gap_links")
      .select("gap_id")
      .eq("project_id", context.projectId)
      .eq("source_id", sourceId),
    context.supabase
      .from("source_requirement_links")
      .select("requirement_id")
      .eq("project_id", context.projectId)
      .eq("source_id", sourceId),
    context.supabase
      .from("source_notes")
      .select("*")
      .eq("project_id", context.projectId)
      .eq("source_id", sourceId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    context.supabase
      .from("source_annotations")
      .select("*")
      .eq("project_id", context.projectId)
      .eq("source_id", sourceId)
      .order("created_at", { ascending: true }),
    context.supabase
      .from("source_annotation_fragments")
      .select("*")
      .eq("project_id", context.projectId)
      .eq("source_id", sourceId)
      .order("page_number", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (
    projectResult.error ||
    !projectResult.data ||
    sourceResult.error ||
    !sourceResult.data
  ) {
    throw new SourcePdfExportError("Kaynak bulunamadı.", 404);
  }

  const asset = assetResult.data;
  const isPdf =
    asset &&
    (String(asset.mime_type).toLowerCase() === "application/pdf" ||
      String(asset.original_filename).toLowerCase().endsWith(".pdf"));

  if (!asset || !isPdf) {
    throw new SourcePdfExportError(
      "İşaretli PDF çıktısı için orijinal PDF dosyası gereklidir.",
      422,
    );
  }

  if (
    sourceGapLinksResult.error ||
    sourceRequirementLinksResult.error ||
    notesResult.error ||
    annotationsResult.error ||
    fragmentsResult.error
  ) {
    throw new SourcePdfExportError("PDF çıktı bağlamı hazırlanamadı.");
  }

  const annotations = annotationsResult.data ?? [];
  const annotationIds = annotations.map((annotation) => annotation.id);
  const [annotationGapLinksResult, annotationRequirementLinksResult] = await Promise.all([
    annotationIds.length
      ? context.supabase
          .from("source_annotation_gap_links")
          .select("annotation_id,gap_id")
          .eq("project_id", context.projectId)
          .in("annotation_id", annotationIds)
      : Promise.resolve({ data: [], error: null }),
    annotationIds.length
      ? context.supabase
          .from("source_annotation_requirement_links")
          .select("annotation_id,requirement_id")
          .eq("project_id", context.projectId)
          .in("annotation_id", annotationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (annotationGapLinksResult.error || annotationRequirementLinksResult.error) {
    throw new SourcePdfExportError("İşaretleme bağlantıları okunamadı.");
  }

  const annotationGapLinks = annotationGapLinksResult.data ?? [];
  const annotationRequirementLinks = annotationRequirementLinksResult.data ?? [];
  const gapIds = uniqueStrings([
    ...(sourceGapLinksResult.data ?? []).map((row) => row.gap_id),
    ...annotationGapLinks.map((row) => row.gap_id),
  ]);
  const requirementIds = uniqueStrings([
    ...(sourceRequirementLinksResult.data ?? []).map((row) => row.requirement_id),
    ...annotationRequirementLinks.map((row) => row.requirement_id),
  ]);

  const [gapsResult, requirementsResult] = await Promise.all([
    gapIds.length
      ? context.supabase
          .from("investigation_information_gaps")
          .select("id,description,status")
          .eq("project_id", context.projectId)
          .in("id", gapIds)
      : Promise.resolve({ data: [], error: null }),
    requirementIds.length
      ? context.supabase
          .from("collection_requirements")
          .select("id,requirement,status,priority")
          .eq("project_id", context.projectId)
          .in("id", requirementIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (gapsResult.error || requirementsResult.error) {
    throw new SourcePdfExportError("PDF çıktı bağlamı okunamadı.");
  }

  const download = await context.supabase.storage
    .from("source-assets")
    .download(String(asset.storage_path));
  if (download.error || !download.data) {
    throw new SourcePdfExportError("Orijinal PDF private Storage'dan okunamadı.");
  }

  const originalBytes = new Uint8Array(await download.data.arrayBuffer());
  let annotated: Uint8Array;
  try {
    annotated = await burnAnnotationsIntoPdf(
      originalBytes,
      annotations,
      fragmentsResult.data ?? [],
    );
  } catch {
    throw new SourcePdfExportError(
      "PDF işaretlemeleri kaynak dosyaya uygulanamadı.",
      422,
    );
  }

  let frontBuffer: Buffer;
  try {
    frontBuffer = await renderToBuffer(
      <FrontMatter
        project={projectResult.data}
        source={sourceResult.data}
        asset={asset}
        gaps={gapsResult.data ?? []}
        requirements={requirementsResult.data ?? []}
        notes={notesResult.data ?? []}
        annotations={annotations}
        fragments={fragmentsResult.data ?? []}
        annotationGapLinks={annotationGapLinks}
        annotationRequirementLinks={annotationRequirementLinks}
      />,
    );
  } catch {
    throw new SourcePdfExportError("CİTEM ön sayfaları üretilemedi.");
  }

  const finalBytes = await mergePdfBytes(new Uint8Array(frontBuffer), annotated);
  if (finalBytes.byteLength > 100 * 1024 * 1024) {
    throw new SourcePdfExportError(
      "Türetilmiş PDF 100 MB saklama sınırını aşıyor.",
      413,
    );
  }

  const filename = safeFilename(s(sourceResult.data.title));
  const exportSha = createHash("sha256").update(finalBytes).digest("hex");
  const canonical = JSON.stringify({
    original_sha256: asset.sha256,
    source: {
      id: sourceResult.data.id,
      title: sourceResult.data.title,
      url: sourceResult.data.url,
      collection_rationale: sourceResult.data.collection_rationale,
    },
    notes: notesResult.data ?? [],
    annotations,
    fragments: fragmentsResult.data ?? [],
    annotation_gap_links: annotationGapLinks,
    annotation_requirement_links: annotationRequirementLinks,
    gaps: gapIds,
    requirements: requirementIds,
  });
  const inputSha = createHash("sha256").update(canonical).digest("hex");
  const exportAssetId = randomUUID();
  const storagePath = `${context.user.id}/${context.projectId}/${sourceId}/${exportAssetId}.pdf`;

  const inserted = await context.supabase.from("source_assets").insert({
    id: exportAssetId,
    project_id: context.projectId,
    source_id: sourceId,
    asset_role: "ANNOTATED_EXPORT",
    state: "PENDING",
    original_filename: filename,
    mime_type: "application/pdf",
    size_bytes: finalBytes.byteLength,
    sha256: exportSha,
    storage_path: storagePath,
    derived_from_asset_id: asset.id,
    created_by: context.user.id,
  });
  if (inserted.error) {
    throw new SourcePdfExportError("Türetilmiş PDF asset kaydı oluşturulamadı.");
  }

  const cleanup = async () => {
    await context.supabase.storage.from("source-assets").remove([storagePath]);
    await context.supabase
      .from("source_assets")
      .delete()
      .eq("project_id", context.projectId)
      .eq("id", exportAssetId);
  };

  const uploaded = await context.supabase.storage
    .from("source-assets")
    .upload(storagePath, finalBytes, { contentType: "application/pdf", upsert: false });
  if (uploaded.error) {
    await cleanup();
    throw new SourcePdfExportError("Türetilmiş PDF private Storage'a yazılamadı.");
  }

  const ready = await context.supabase
    .from("source_assets")
    .update({ state: "READY", ready_at: new Date().toISOString() })
    .eq("project_id", context.projectId)
    .eq("id", exportAssetId);
  if (ready.error) {
    await cleanup();
    throw new SourcePdfExportError("Türetilmiş PDF finalize edilemedi.");
  }

  const audit = await context.supabase.from("source_export_events").insert({
    project_id: context.projectId,
    source_id: sourceId,
    asset_id: asset.id,
    export_asset_id: exportAssetId,
    export_kind: "ANNOTATED_PDF",
    annotation_count: annotations.length,
    note_count: (notesResult.data ?? []).length,
    source_sha256: asset.sha256,
    export_sha256: exportSha,
    export_input_sha256: inputSha,
    export_filename: filename,
    created_by: context.user.id,
  });
  if (audit.error) {
    await cleanup();
    throw new SourcePdfExportError(
      "PDF üretildi ancak export audit kaydı yazılamadı.",
    );
  }

  return { bytes: finalBytes, filename, sha256: exportSha };
}
