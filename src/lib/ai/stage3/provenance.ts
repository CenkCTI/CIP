export type Stage3Span = {
  token: string;
  text: string;
  page: number | null;
  kind: "PDF" | "ANNOTATION";
  sourceId: string;
  assetId: string;
  annotationId?: string;
};
export type Stage3Support = {
  statement: string;
  quote: string;
  sourceToken: string;
  page: number | null;
  kind: Stage3Span["kind"];
  provenance: { sourceId: string; assetId: string; annotationId?: string };
};

export function normalizedQuote(text: string) {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}
export function resolveGroundedEvidence(
  evidence: { statement: string; quote: string; source_token: string }[],
  spans: Stage3Span[],
) {
  const byToken = new Map(spans.map((span) => [span.token, span]));
  const accepted: Stage3Support[] = [];
  let rejected = 0;
  for (const item of evidence) {
    const span = byToken.get(item.source_token);
    const quote = normalizedQuote(item.quote);
    if (!span || !quote || !normalizedQuote(span.text).includes(quote)) {
      rejected++;
      continue;
    }
    accepted.push({
      statement: item.statement,
      quote: item.quote,
      sourceToken: span.token,
      page: span.page,
      kind: span.kind,
      provenance: { sourceId: span.sourceId, assetId: span.assetId, ...(span.annotationId ? { annotationId: span.annotationId } : {}) },
    });
  }
  return { accepted, rejected };
}
export function documentSpans(
  pages: { page: number; text: string }[],
  sourceId: string,
  assetId: string,
  chunkSize = 7000,
  overlap = 400,
): Stage3Span[] {
  if (chunkSize < 1000 || overlap < 0 || overlap >= chunkSize) throw new Error("invalid_chunk_config");
  const spans: Stage3Span[] = [];
  for (const { page, text } of pages) {
    const cleaned = text.replace(/\s+/g, " ").trim();
    for (let offset = 0, chunk = 1; offset < cleaned.length; offset += chunkSize - overlap, chunk++) {
      spans.push({
        token: `DOC_P${String(page).padStart(3, "0")}_C${String(chunk).padStart(2, "0")}`,
        text: cleaned.slice(offset, offset + chunkSize),
        page, kind: "PDF", sourceId, assetId,
      });
      if (offset + chunkSize >= cleaned.length) break;
    }
  }
  return spans;
}
export function modelFacingSpans(spans: Stage3Span[]) {
  return spans.map(({ token, text }) => ({ source_token: token, text }));
}
