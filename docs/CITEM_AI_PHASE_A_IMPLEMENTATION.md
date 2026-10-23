# CITEM AI — Phase A architecture, contracts and release gates

**Work branch:** existing PR #84 only; do not create a second PR.
**Source of requirements:** `CITEM_AI_Multilingual_RAG_Master_Prompt(1).md`,
Phase A1–A5. **Live migration/merge:** not authorized here.

## ADR A-001 — Extracted source is not canonical truth

- Keep `source_assets` + private Storage bytes authoritative.
- Verify original SHA-256 before indexing and inside the publication RPC.
- Store a revisionable *derived* extraction run and its complete page
  snapshot, indexed by project/owner/source/asset/source SHA.
- Page `original_text` is the exact extracted engine output, not a
  silently corrected OCR/LLM version. Page `search_text` is the
  accent-/ligature-normalized alias, never cited as an original quote.
- Metadata values from extracted text, AI suggestions, analyst approval
  and independent official pages are separate origins. The Phase A
  publisher intentionally supplies no unreviewed metadata candidates,
  retains upload metadata as read-only provenance and leaves
  publication/publisher/TLP fields null when not verified.
- Every run records engine version, extraction fingerprint, page count,
  quality, language heuristic, completion time and page hashes.
- Retention: derived runs/pages cascade from project, source and index,
  but the original PDF itself is not deleted by any index refresh.

## ADR A-002 — Versioned atomic page/chunk publication

Migration sequence: `066 -> 067 -> 068`, never edit deployed 066/067.

1. Owner-scoped API checks the ORIGINAL/READY asset and exact Storage SHA.
2. Parse all pages (max 200, 500k characters and 50MB source).
3. Produce `buildExtractionManifest`; reject missing/reordered pages,
   no-text, unmapped glyphs, OCR text requiring analyst review or other
   quality anomalies from automatic complete-state publication.
4. Keep existing deterministic `splitPagesForIndex` 1800/180
   page-local chunk boundaries and 1500-chunk upper bound.
5. The service-role-only v2 claim fences concurrent writers by token.
6. The v3 publication function validates page list and sha256(text)
   hashes, delegates chunk insert and source-SHA fencing to v2, then
   creates a page-snapshot run and associates every chunk with that
   run inside the same PostgreSQL transaction. A failing statement
   rolls back the entire publication.
7. The index points to exact `extraction_run_id`. Read paths require
   `status=READY`, `quality_status=COMPLETE`, a current
   `CITEM-PDF-INDEX-A1-20261023` version, current source SHA and
   identical chunk/run identity.
8. Old v2 READY caches are not automatically promoted. Rebuild only
   using owner-authorized original bytes and the current pipeline.

**Known limitation:** v2 claim temporarily moves the original index
status from READY to PROCESSING. If reindex fails, older derived
chunks remain in DB but are not exposed as current truth. This is
intentional fail-closed behavior, not zero-downtime shadow indexing.

## ADR A-003 — Safe OCR and confidence gates

PDF.js is default. Local Poppler and French OCR are **opt-in only** and
may be unavailable on Vercel. Poppler may reproduce the same broken
ToUnicode map; it is not a proof that a reprinted PDF is reliable.
OCR can repair a visually correct page but may miss margin labels or
misrecognize dates. A recovered OCR page is labeled `REVIEW_REQUIRED`;
it is **not** automatically READY or an exact verified quote.
Do not send private source bytes to another provider.

The future isolated BAYKUSH Node OCR worker is intentionally deferred;
PR #84 implements local contracts but does not deploy a new server.

## ADR A-004 — Page/chunk citation integrity

- Page text retains immutable engine output; chunk `content` keeps
  the existing whitespace-collapsed index representation, with its own
  SHA, section type, extractor version and search alias. The original
  rendered PDF and extracted original page remain available for quote
  checks. Index offsets are intentionally null/absent because raw PDF
  glyph layout is not a valid stable char-offset namespace.
- Search aliases remove accents / expand `œ/æ` for retrieval only;
  `simple` FTS on original chunk content also remains available.
- Section classification separates COVER, TABLE_OF_CONTENTS,
  BIBLIOGRAPHY and BODY. No false claim that a TOC represents the
  underlying body evidence.
- DOC/MEM/ANN source tokens must still resolve to an owned original
  asset, current source SHA and page; a model's quote is not proof.
- Missing source or invalid glyph text is excluded from the analyst
  model evidence pack and the relevant fallback is explicit.

## Quality and status semantics

| State | Meaning | Claim-safe automatic READY? |
| --- | --- | --- |
| No index or stale version | No current validated extraction | No |
| PROCESSING | Claim token currently held | No |
| ERROR | Last publication failed; original file intact | No |
| REVIEW_REQUIRED | OCR or bad glyphs/partial legibility | No |
| COMPLETE | Fully extracted page coverage with clean source text | Eligible, not semantic truth |
| READY + COMPLETE + exact SHA/current version | Current indexed evidence | Retrieval allowed |

The existing 066 database status check stays
`PROCESSING/READY/ERROR`; the new quality dimension avoids rewriting
historical statuses or lying about OCR success.

## Phase A exit criteria and evidence

- A1: SHA-verified asset reader, 067 claim fencing, explicit fallback,
  no page-1 masquerading as entire PDF: implemented earlier in PR83.
- A2: authoritative metadata linkage, immutable run/page provenance,
  engine+hash+version and no fabricated metadata: implemented in PR84.
- A3: language heuristic and search-only Unicode normalization; font
  damage detection; independent extraction candidate; OCR review gate:
  implemented in PR84, runtime worker deployment deferred.
- A4: deterministic existing chunking, page-local citations, new
  per-chunk SHA/search alias and transactional run linkage: implemented
  in PR84. Paragraph-aware chunking/offset benchmark deferred pending
  real 50–80 question gold set; not falsely marked passing.
- A5: **not yet accepted** until a disposable PostgreSQL migration/RLS
  test, full exact-source index and real CITEM model/browser citation
  acceptance are recorded. CI green alone is insufficient.

## Rollout and rollback safety

Apply migration 068 **before** deploying code that expects its columns
and v3 RPC. Migration 068 intentionally does not modify original
Storage, reindex user files, or turn stale READY into current evidence.
Review expected degraded search availability until owner-approved
reindex. A failed code rollout can be rolled back at the application
layer after confirming schema compatibility; never down-migrate or
bulk-relabel old READY indexes. Keep source SHA and artifact identity
in every acceptance report. Restrict service-role credentials to
server-side; no document text/key in logs. Phase B can be started only
after owner/RLS, source, and quote acceptance.
