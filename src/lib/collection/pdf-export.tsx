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

const PDF_COLORS = {
  background: "#0B0F12",
  panel: "#11171C",
  panelRaised: "#151C22",
  border: "#28323A",
  borderSoft: "#202930",
  text: "#F4F1EA",
  body: "#D5D1C8",
  muted: "#918B80",
  mutedBright: "#B5AFA4",
  accent: "#C58A3A",
  accentBright: "#E4B66D",
  accentSoft: "#2B2115",
  quote: "#10151A",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 42,
    paddingHorizontal: 34,
    fontSize: 9.2,
    lineHeight: 1.45,
    color: PDF_COLORS.body,
    backgroundColor: PDF_COLORS.background,
    fontFamily: CITEM_PDF_FONT_FAMILY,
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  brand: {
    fontSize: 8.5,
    letterSpacing: 2.7,
    color: PDF_COLORS.accentBright,
  },
  documentType: {
    fontSize: 7,
    letterSpacing: 1.1,
    color: PDF_COLORS.muted,
  },
  hero: {
    backgroundColor: PDF_COLORS.panelRaised,
    borderWidth: 1,
    borderColor: PDF_COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.accent,
    borderRadius: 8,
    paddingTop: 17,
    paddingBottom: 16,
    paddingHorizontal: 17,
    marginBottom: 13,
  },
  eyebrow: {
    fontSize: 7.2,
    letterSpacing: 1.4,
    color: PDF_COLORS.accentBright,
    marginBottom: 7,
  },
  title: {
    fontSize: 23,
    fontWeight: 700,
    lineHeight: 1.08,
    color: PDF_COLORS.text,
    marginBottom: 7,
  },
  subtitle: {
    fontSize: 9.2,
    color: PDF_COLORS.mutedBright,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 10,
  },
  halfLeft: {
    width: "49%",
    marginRight: "2%",
  },
  halfRight: {
    width: "49%",
  },
  card: {
    backgroundColor: PDF_COLORS.panel,
    borderWidth: 1,
    borderColor: PDF_COLORS.borderSoft,
    borderRadius: 7,
    padding: 11,
    marginBottom: 10,
  },
  cardLast: {
    backgroundColor: PDF_COLORS.panel,
    borderWidth: 1,
    borderColor: PDF_COLORS.borderSoft,
    borderRadius: 7,
    padding: 11,
  },
  cardLabel: {
    fontSize: 6.8,
    letterSpacing: 1.15,
    color: PDF_COLORS.accentBright,
    marginBottom: 5,
  },
  cardTitle: {
    fontSize: 10.4,
    fontWeight: 700,
    color: PDF_COLORS.text,
    lineHeight: 1.3,
    marginBottom: 4,
  },
  body: {
    fontSize: 8.8,
    color: PDF_COLORS.body,
    lineHeight: 1.45,
  },
  bodyMuted: {
    fontSize: 8.1,
    color: PDF_COLORS.mutedBright,
    lineHeight: 1.4,
  },
  question: {
    fontSize: 8.6,
    color: PDF_COLORS.body,
    lineHeight: 1.46,
    paddingTop: 6,
    marginTop: 5,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.borderSoft,
  },
  listItem: {
    fontSize: 8.2,
    color: PDF_COLORS.body,
    lineHeight: 1.42,
    marginBottom: 5,
  },
  bullet: {
    color: PDF_COLORS.accentBright,
  },
  provenanceRow: {
    marginBottom: 6,
  },
  provenanceLabel: {
    fontSize: 6.3,
    letterSpacing: 0.75,
    color: PDF_COLORS.muted,
    marginBottom: 1,
  },
  provenanceValue: {
    fontSize: 7.6,
    color: PDF_COLORS.body,
    lineHeight: 1.35,
  },
  disclaimer: {
    fontSize: 6.8,
    color: PDF_COLORS.muted,
    lineHeight: 1.4,
    marginTop: 4,
  },
  secondPageIntro: {
    fontSize: 8.7,
    color: PDF_COLORS.mutedBright,
    lineHeight: 1.45,
    marginBottom: 14,
  },
  heading: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1,
    color: PDF_COLORS.accentBright,
    marginTop: 4,
    marginBottom: 7,
  },
  noteCard: {
    backgroundColor: PDF_COLORS.panel,
    borderWidth: 1,
    borderColor: PDF_COLORS.borderSoft,
    borderRadius: 7,
    padding: 11,
    marginBottom: 8,
  },
  annotationCard: {
    backgroundColor: PDF_COLORS.panel,
    borderWidth: 1,
    borderColor: PDF_COLORS.borderSoft,
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.accent,
    borderRadius: 7,
    padding: 11,
    marginBottom: 8,
  },
  annotationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
  },
  annotationIndex: {
    fontSize: 7,
    letterSpacing: 0.9,
    color: PDF_COLORS.accentBright,
  },
  badge: {
    fontSize: 6.5,
    color: PDF_COLORS.accentBright,
    backgroundColor: PDF_COLORS.accentSoft,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  quoteBox: {
    backgroundColor: PDF_COLORS.quote,
    borderLeftWidth: 2,
    borderLeftColor: PDF_COLORS.accent,
    paddingVertical: 7,
    paddingHorizontal: 8,
    marginBottom: 7,
  },
  quoteLabel: {
    fontSize: 6.2,
    letterSpacing: 0.7,
    color: PDF_COLORS.muted,
    marginBottom: 3,
  },
  quoteText: {
    fontSize: 8,
    color: PDF_COLORS.body,
    lineHeight: 1.45,
  },
  analystLabel: {
    fontSize: 6.2,
    letterSpacing: 0.7,
    color: PDF_COLORS.muted,
    marginBottom: 3,
  },
  analystText: {
    fontSize: 8.2,
    color: PDF_COLORS.text,
    lineHeight: 1.45,
    marginBottom: 7,
  },
  linkedContext: {
    fontSize: 7.3,
    color: PDF_COLORS.mutedBright,
    lineHeight: 1.4,
    marginTop: 3,
  },
  legacy: {
    fontSize: 6.8,
    color: PDF_COLORS.accentBright,
    marginTop: 7,
  },
  footer: {
    position: "absolute",
    left: 34,
    bottom: 18,
    fontSize: 6.4,
    color: PDF_COLORS.muted,
  },
  pageNo: {
    position: "absolute",
    right: 34,
    bottom: 18,
    fontSize: 6.4,
    color: PDF_COLORS.muted,
  },
});

function date(value: unknown) {
  if (!value) return "Not specified";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "Not specified" : parsed.toISOString().slice(0, 10);
}

function truncate(value: string, max = 430) {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function wrapTechnicalValue(value: unknown, chunk = 42) {
  const text = s(value);
  if (!text) return "—";
  if (text.length <= chunk) return text;
  return text.match(new RegExp(`.{1,${chunk}}`, "g"))?.join("\n") ?? text;
}

function safeFilename(title: string) {
  const stem =
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 90) || "source";
  return `CITEM_${stem}_annotated.pdf`;
}

function annotationTypeLabel(value: unknown) {
  if (value === "HIGHLIGHT") return "Highlight";
  if (value === "UNDERLINE") return "Underline";
  if (value === "REGION") return "Region";
  return s(value);
}

function sourcePageLabel(annotation: Row, annotationFragments: Row[]) {
  const pages = [
    ...new Set(
      annotationFragments
        .map((fragment) => Number(fragment.page_number))
        .filter((page) => Number.isInteger(page) && page > 0),
    ),
  ].sort((a, b) => a - b);
  if (!pages.length) {
    const fallback = Number(annotation.page_number);
    return Number.isInteger(fallback) && fallback > 0 ? `Page ${fallback}` : "Page —";
  }
  return pages.length === 1 ? `Page ${pages[0]}` : `Pages ${pages.join(", ")}`;
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
  const requirementById = new Map(
    requirements.map((requirement) => [s(requirement.id), requirement]),
  );
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

  const publisherLine = `${s(source.publisher) || "Publisher not specified"} · ${date(
    source.published_at,
  )}`;

  return (
    <Document
      title={`CITEM - ${s(source.title)}`}
      creator="BAYKUSH / CITEM"
      producer="BAYKUSH / CITEM"
      creationDate={STABLE_PDF_DATE}
      modificationDate={STABLE_PDF_DATE}
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>BAYKUSH / CITEM</Text>
          <Text style={styles.documentType}>ANNOTATED SOURCE EXPORT</Text>
        </View>

        <View style={styles.hero} wrap={false}>
          <Text style={styles.eyebrow}>COLLECTION / SOURCE PROVENANCE</Text>
          <Text style={styles.title}>WORKING SOURCE COPY</Text>
          <Text style={styles.subtitle}>
            Traceable analyst research output with immutable-source provenance
          </Text>
        </View>

        <View style={styles.sectionRow}>
          <View style={styles.halfLeft}>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>INVESTIGATION</Text>
              <Text style={styles.cardTitle}>{s(project.name) || "Untitled investigation"}</Text>
              <Text style={styles.provenanceLabel}>PRIMARY INTELLIGENCE QUESTION</Text>
              <Text style={styles.question}>
                {s(project.research_question) || "No primary intelligence question recorded."}
              </Text>
            </View>

            <View style={styles.cardLast}>
              <Text style={styles.cardLabel}>SOURCE</Text>
              <Text style={styles.cardTitle}>{s(source.title) || "Untitled source"}</Text>
              <Text style={styles.bodyMuted}>{publisherLine}</Text>
            </View>
          </View>

          <View style={styles.halfRight}>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>COLLECTION CONTEXT</Text>
              <Text style={styles.body}>
                {s(source.collection_rationale) || "No collection rationale recorded."}
              </Text>
            </View>

            <View style={styles.cardLast}>
              <Text style={styles.cardLabel}>SOURCE PROVENANCE</Text>

              <View style={styles.provenanceRow}>
                <Text style={styles.provenanceLabel}>SOURCE ID</Text>
                <Text style={styles.provenanceValue}>{wrapTechnicalValue(source.id)}</Text>
              </View>
              <View style={styles.provenanceRow}>
                <Text style={styles.provenanceLabel}>ASSET ID</Text>
                <Text style={styles.provenanceValue}>{wrapTechnicalValue(asset.id)}</Text>
              </View>
              <View style={styles.provenanceRow}>
                <Text style={styles.provenanceLabel}>ORIGINAL FILE</Text>
                <Text style={styles.provenanceValue}>
                  {s(asset.original_filename) || "Not specified"}
                </Text>
              </View>
              <View style={styles.provenanceRow}>
                <Text style={styles.provenanceLabel}>SHA-256</Text>
                <Text style={styles.provenanceValue}>
                  {wrapTechnicalValue(asset.sha256, 32)}
                </Text>
              </View>
              <View>
                <Text style={styles.provenanceLabel}>ORIGINAL SOURCE URL</Text>
                <Text style={styles.provenanceValue}>
                  {wrapTechnicalValue(source.url, 46)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sectionRow}>
          <View style={styles.halfLeft}>
            <View style={styles.cardLast}>
              <Text style={styles.cardLabel}>INFORMATION GAPS</Text>
              {gaps.length ? (
                gaps.map((gap) => (
                  <Text key={s(gap.id)} style={styles.listItem}>
                    <Text style={styles.bullet}>• </Text>
                    {s(gap.description)}
                  </Text>
                ))
              ) : (
                <Text style={styles.bodyMuted}>No linked information gaps.</Text>
              )}
            </View>
          </View>

          <View style={styles.halfRight}>
            <View style={styles.cardLast}>
              <Text style={styles.cardLabel}>COLLECTION REQUIREMENTS</Text>
              {requirements.length ? (
                requirements.map((requirement) => (
                  <Text key={s(requirement.id)} style={styles.listItem}>
                    <Text style={styles.bullet}>• </Text>
                    {s(requirement.requirement)}
                  </Text>
                ))
              ) : (
                <Text style={styles.bodyMuted}>No linked collection requirements.</Text>
              )}
            </View>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          This file is a derived CITEM analyst working copy. Analyst-created notes and
          annotations are separate from the source itself. The immutable original source is
          retained independently and is not overwritten by this export.
        </Text>

        <Text fixed style={styles.footer}>
          BAYKUSH / CITEM · WORKING COPY · IMMUTABLE ORIGINAL PRESERVED
        </Text>
        <Text
          fixed
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          style={styles.pageNo}
        />
      </Page>

      {notes.length || ordered.length ? (
        <Page size="A4" style={styles.page} wrap>
          <View style={styles.brandRow}>
            <Text style={styles.brand}>BAYKUSH / CITEM</Text>
            <Text style={styles.documentType}>ANALYST WORKING LAYER</Text>
          </View>

          <View style={styles.hero} wrap={false}>
            <Text style={styles.eyebrow}>SOURCE REVIEW / ANNOTATION INDEX</Text>
            <Text style={styles.title}>ANALYST NOTES &amp; ANNOTATION SUMMARY</Text>
            <Text style={styles.subtitle}>
              Structured analyst-created context linked back to the immutable source
            </Text>
          </View>

          {notes.length ? (
            <>
              <Text style={styles.heading}>SOURCE NOTES</Text>
              {notes.map((note, index) => (
                <View key={s(note.id)} style={styles.noteCard} wrap={false}>
                  <Text style={styles.cardLabel}>SOURCE NOTE {index + 1}</Text>
                  <Text style={styles.body}>{s(note.body)}</Text>
                </View>
              ))}
            </>
          ) : null}

          {ordered.length ? (
            <>
              <Text style={styles.heading}>ANNOTATION INDEX</Text>
              {ordered.map((annotation, index) => {
                const annotationId = s(annotation.id);
                const annotationFragments = fragmentsByAnnotation.get(annotationId) ?? [];
                const legacy = Number(annotation.geometry_version) !== 2;
                const linkedGapIds = gapIdsByAnnotation.get(annotationId) ?? [];
                const linkedRequirementIds = requirementIdsByAnnotation.get(annotationId) ?? [];
                const pageLabel = sourcePageLabel(annotation, annotationFragments);

                return (
                  <View key={annotationId} style={styles.annotationCard} wrap={false}>
                    <View style={styles.annotationHeader}>
                      <Text style={styles.annotationIndex}>
                        {String(index + 1).padStart(2, "0")} · {pageLabel.toUpperCase()}
                      </Text>
                      <Text style={styles.badge}>
                        {annotationTypeLabel(annotation.annotation_type).toUpperCase()}
                      </Text>
                    </View>

                    {annotation.selected_text ? (
                      <View style={styles.quoteBox}>
                        <Text style={styles.quoteLabel}>SELECTED SOURCE TEXT</Text>
                        <Text style={styles.quoteText}>
                          {truncate(s(annotation.selected_text))}
                        </Text>
                      </View>
                    ) : null}

                    <Text style={styles.analystLabel}>ANALYST NOTE</Text>
                    <Text style={styles.analystText}>
                      {s(annotation.comment) || "No analyst comment recorded."}
                    </Text>

                    {linkedGapIds.map((gapId) => (
                      <Text key={gapId} style={styles.linkedContext}>
                        Information Gap: {s(gapById.get(gapId)?.description) || gapId}
                      </Text>
                    ))}
                    {linkedRequirementIds.map((requirementId) => (
                      <Text key={requirementId} style={styles.linkedContext}>
                        Collection Requirement:{" "}
                        {s(requirementById.get(requirementId)?.requirement) || requirementId}
                      </Text>
                    ))}

                    {legacy ? (
                      <Text style={styles.legacy}>
                        Legacy screen-coordinate annotation: not burned into the source PDF.
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </>
          ) : null}

          <Text style={styles.secondPageIntro}>
            Notes and annotations on this page are analyst-created working context. They are
            not part of the original publication.
          </Text>

          <Text fixed style={styles.footer}>
            BAYKUSH / CITEM · ANALYST WORKING LAYER · SOURCE PROVENANCE RETAINED
          </Text>
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
