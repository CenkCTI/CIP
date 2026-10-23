import type {Stage3Span} from "./provenance";

/** Exact numeric identifiers in font-private PDF text are not safe to infer. */
export function isPdfExactValueQuestion(question:string):boolean{
  return /(?:tarih|başlangıç|bitiş|hangi yıl|ne zaman|yıllar|[Cc][Vv][Ee]-\d{4}|date|start date|end date|when|timeline|\byear\b|hash|fingerprint|sha-?256)/i.test(question);
}
/** Source-only questions need a literal quotation; free-standing strategy
 * questions can still receive clearly marked conditional hypotheses. */
export function requestsSourceGroundedAnswer(question:string):boolean{
  return /(?:pdf|rapor|kaynak|alıntı|sayfa|belge|orijinal|report|document|original|citation|cite|quote|\\bpage\\b)/i.test(question);
}
export function hasUnmappedPdfGlyphs(spans:Stage3Span[]):boolean{
  return spans.some(span=>span.kind==="PDF"&&/[\uE000-\uF8FF\uFFFD]/u.test(span.text));
}
export function requiresExactPdfValueAbstention(question:string,spans:Stage3Span[]):boolean{
  return isPdfExactValueQuestion(question)&&hasUnmappedPdfGlyphs(spans);
}
