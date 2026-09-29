import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { quadBounds, type PdfQuad } from "@/lib/collection/pdf-geometry";

type Row = Record<string, unknown>;

const s = (value: unknown) => String(value ?? "");
const STABLE_PDF_DATE = new Date("2000-01-01T00:00:00.000Z");

function applyStableDerivedMetadata(document: PDFDocument) {
  document.setCreator("BAYKUSH / CİTEM");
  document.setProducer("BAYKUSH / CİTEM");
  document.setCreationDate(STABLE_PDF_DATE);
  document.setModificationDate(STABLE_PDF_DATE);
}

function validQuad(value: PdfQuad) {
  return [
    value.x1,
    value.y1,
    value.x2,
    value.y2,
    value.x3,
    value.y3,
    value.x4,
    value.y4,
  ].every(Number.isFinite);
}

function quadHighlightLine(quad: PdfQuad) {
  const start = { x: (quad.x1 + quad.x4) / 2, y: (quad.y1 + quad.y4) / 2 };
  const end = { x: (quad.x2 + quad.x3) / 2, y: (quad.y2 + quad.y3) / 2 };
  const leftHeight = Math.hypot(quad.x1 - quad.x4, quad.y1 - quad.y4);
  const rightHeight = Math.hypot(quad.x2 - quad.x3, quad.y2 - quad.y3);
  return {
    start,
    end,
    thickness: Math.max(0.5, (leftHeight + rightHeight) / 2),
  };
}

export function orderAnnotations(annotations: Row[], fragments: Row[]) {
  const first = new Map<string, Row>();
  for (const fragment of fragments) {
    const id = s(fragment.annotation_id);
    const current = first.get(id);
    if (!current || Number(fragment.page_number) < Number(current.page_number)) {
      first.set(id, fragment);
    }
  }

  return [...annotations].sort((a, b) => {
    const af = first.get(s(a.id));
    const bf = first.get(s(b.id));
    const ap = Number(af?.page_number ?? a.page_number ?? Number.MAX_SAFE_INTEGER);
    const bp = Number(bf?.page_number ?? b.page_number ?? Number.MAX_SAFE_INTEGER);
    if (ap !== bp) return ap - bp;

    const aq = Array.isArray(af?.quads) ? ((af?.quads as PdfQuad[])[0] ?? null) : null;
    const bq = Array.isArray(bf?.quads) ? ((bf?.quads as PdfQuad[])[0] ?? null) : null;
    const ab = aq && validQuad(aq) ? quadBounds(aq) : null;
    const bb = bq && validQuad(bq) ? quadBounds(bq) : null;

    if ((ab?.maxY ?? -Infinity) !== (bb?.maxY ?? -Infinity)) {
      return (bb?.maxY ?? -Infinity) - (ab?.maxY ?? -Infinity);
    }
    if ((ab?.minX ?? Infinity) !== (bb?.minX ?? Infinity)) {
      return (ab?.minX ?? Infinity) - (bb?.minX ?? Infinity);
    }
    return (
      s(a.created_at).localeCompare(s(b.created_at)) ||
      s(a.id).localeCompare(s(b.id))
    );
  });
}

export async function burnAnnotationsIntoPdf(
  original: Uint8Array,
  annotations: Row[],
  fragments: Row[],
) {
  const document = await PDFDocument.load(original);
  applyStableDerivedMetadata(document);
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  const ordered = orderAnnotations(annotations, fragments);
  const numberById = new Map(ordered.map((annotation, index) => [s(annotation.id), index + 1]));
  const annotationById = new Map(annotations.map((annotation) => [s(annotation.id), annotation]));
  const firstFragmentSeen = new Set<string>();

  for (const fragment of fragments) {
    const annotation = annotationById.get(s(fragment.annotation_id));
    if (!annotation || Number(annotation.geometry_version) !== 2) continue;

    const pageNumber = Number(fragment.page_number);
    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > document.getPageCount()
    ) {
      continue;
    }

    const page = document.getPage(pageNumber - 1);
    const quads = Array.isArray(fragment.quads)
      ? (fragment.quads as PdfQuad[]).filter(validQuad)
      : [];

    for (const quad of quads) {
      const bounds = quadBounds(quad);
      if (annotation.annotation_type === "HIGHLIGHT") {
        const highlight = quadHighlightLine(quad);
        page.drawLine({
          start: highlight.start,
          end: highlight.end,
          thickness: highlight.thickness,
          color: rgb(0.96, 0.67, 0.18),
          opacity: 0.24,
        });
      } else if (annotation.annotation_type === "UNDERLINE") {
        page.drawLine({
          start: { x: quad.x4, y: quad.y4 },
          end: { x: quad.x3, y: quad.y3 },
          thickness: 1.5,
          color: rgb(0.79, 0.48, 0.12),
          opacity: 0.95,
        });
      } else if (annotation.annotation_type === "REGION") {
        page.drawLine({
          start: { x: quad.x1, y: quad.y1 },
          end: { x: quad.x2, y: quad.y2 },
          thickness: 1.5,
          color: rgb(0.79, 0.48, 0.12),
          opacity: 0.95,
        });
        page.drawLine({
          start: { x: quad.x2, y: quad.y2 },
          end: { x: quad.x3, y: quad.y3 },
          thickness: 1.5,
          color: rgb(0.79, 0.48, 0.12),
          opacity: 0.95,
        });
        page.drawLine({
          start: { x: quad.x3, y: quad.y3 },
          end: { x: quad.x4, y: quad.y4 },
          thickness: 1.5,
          color: rgb(0.79, 0.48, 0.12),
          opacity: 0.95,
        });
        page.drawLine({
          start: { x: quad.x4, y: quad.y4 },
          end: { x: quad.x1, y: quad.y1 },
          thickness: 1.5,
          color: rgb(0.79, 0.48, 0.12),
          opacity: 0.95,
        });
      }
    }

    const annotationId = s(annotation.id);
    if (
      annotation.comment &&
      !firstFragmentSeen.has(annotationId) &&
      quads.length
    ) {
      firstFragmentSeen.add(annotationId);
      const bounds = quadBounds(quads[0]);
      const number = numberById.get(annotationId) ?? 0;
      const x = Math.max(2, Math.min(page.getWidth() - 18, bounds.maxX + 3));
      const y = Math.max(8, Math.min(page.getHeight() - 14, bounds.maxY));

      page.drawCircle({
        x: x + 6,
        y: y + 4,
        size: 6,
        color: rgb(0.79, 0.48, 0.12),
        opacity: 0.95,
      });
      page.drawText(String(number), {
        x: x + 3.3,
        y: y + 0.7,
        size: 6.5,
        font,
        color: rgb(1, 1, 1),
      });
    }
  }

  return new Uint8Array(await document.save());
}

export async function mergePdfBytes(frontMatter: Uint8Array, source: Uint8Array) {
  const output = await PDFDocument.create();
  applyStableDerivedMetadata(output);
  const front = await PDFDocument.load(frontMatter);
  const body = await PDFDocument.load(source);

  const frontPages = await output.copyPages(front, front.getPageIndices());
  frontPages.forEach((page) => output.addPage(page));
  const bodyPages = await output.copyPages(body, body.getPageIndices());
  bodyPages.forEach((page) => output.addPage(page));

  return new Uint8Array(await output.save());
}
