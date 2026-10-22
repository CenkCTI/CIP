# CİTEM AI Phase 6 — Claim-Centric Research & Corroboration (candidate assessments)

**Scope note:** the original AI Processing Copilot plan ended at Phase 5. Phase 6 is a NEW,
analyst-approved extension based on the explicit next objective: compare PDF claims with
multiple externally retrieved sources, with bidirectional provenance. It is **not** an
autonomous attribution engine.

## Implemented
- After Phase 5 Brave Search, select 1–3 results via checkboxes; click **Compare selected with PDF**.
- The server validates session origin, owned Investigation/project, selected ORIGINAL/READY PDF
  source+asset and page/page range/annotation via Stage 3 read-only context. Client cannot inject source text.
- The existing bounded, public-HTTPS, pinned-DNS fetcher reads ONLY analyst-approved URLs.
- NVIDIA NIM BYOK generates one candidate source claim and a per-URL suggested comparison
  (supports, contradicts, qualifies or insufficient_evidence). An LLM does not establish
  factual accuracy or source independence.
- Deterministic server-side quote verification **requires a verbatim PDF excerpt**; reject
  the entire output if it cannot be matched. For each WEB quote that cannot be matched to the
  corresponding server-fetched page, discard the quote and downgrade its relationship to
  insufficient_evidence. WEB_001–WEB_003 are never interchangeable.
- The review UI displays PDF provenance, page navigation, separate WEB quote links,
  timestamps, uncertainty, scope limitations and open questions.
- No Source, Claim, assessment, or intelligence domain writes. No saving of comparison
  state to the DB; manual Stage 2 Source handoff from Phase 5 remains separate.

## Constraints and follow-up
- The analysis processes a bounded PDF selection (first six spans of at most 3,500
  characters each) and up to three external pages (8,000 characters each).
  Truncation is disclosed; missing evidence does not imply falsehood.
- The model may paraphrase incorrectly or mislabel a relationship despite exact quotations.
  Analyst review is therefore always required. Comparisons are **candidates**, not
  automatic independent corroboration.
- Network/SSRF security derives from Phase 5; verify live access isolation, redirects,
  DNS rebinding, provider errors and rate limits before production adoption.
- Every comparison requires an explicit click; independent search is still forbidden.
- Test cases include malformed source IDs, untrusted input fields, invalid quotes, mismatched
  WEB tokens, max-three selection and positive UI evidence navigation.

## Acceptance
1. Open Phase 6 PR Preview and select PDF page 11 of the source report.
2. Suggest queries and Search selected, choose up to three independent external leads.
3. Press Compare selected with PDF. Confirm original PDF token/page and WEB tokens, quoted
   excerpts and suggested (not final) relationships.
4. Try a weak event page; verify no direct evidence is disclosed rather than elevated to proof.
5. Verify Source/Claim records remain unchanged until explicit normal Stage 2 action.
6. Run CI, SSRF/cross-user security acceptance and inspect quote-verification failures.

## Analyst acceptance correction (2026-10-22)

A live test supplied only a Wikipedia StarTimes result and the compare action produced one PDF quote but no valid WEB quote. That is a **provenance-safe inconclusive result**, not evidence that the source contradicts or supports the PDF. The PDF excerpt (“Your reports cites examples...”) is a reporter's question/attribution, not an independent factual finding. This change:

- Marks obvious questions and report attributions as such, preserving the literal PDF quotation.
- Suppresses an AI paraphrase that would add unsupported StarTimes-specific details to that question.
- Distinguishes `no_quote` from `rejected_quote` and labels both as unverified comparisons, never “no evidence exists.”
- Clarifies that selecting 2–3 diverse external research reports improves the chance of corroboration but does not certify independence.
- Keeps server-side verbatim matching and analyst-only approval boundaries intact.
