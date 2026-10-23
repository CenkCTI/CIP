# CITEM AI Phase A — Verified baseline audit (2026-10-23)

## Actual repository state

- Repository: `CenkCTI/CIP`; approved base: `main`.
- PR #83 was merged on 2026-10-23: `745e02b6938c73b96f2bc6f777fcdbb6a1f11b8c`.
- All Phase A edits are on existing **Draft PR #84** (`feat/citem-ai-phase-a-extraction-quality`).
- PR #83 migrations 066/067 introduced owner-scoped lexical RAG, claim
  fencing and atomic chunks; Phase A migration **068** is forward-only.
- The owned original-asset reader includes `sha256`; the SHA is checked
  against the exact downloaded original before any indexing claim.
- The new PDF API `extractPdfPagesDetailed` preserves the actual
  per-page text engine without changing older `extractPdfPages` callers.

## Source evidence and distinct byte identities

1. Official ANSSI `CERTFR-2023-CTI-009` PDF downloaded by CI:
   2,487,153 bytes; SHA-256
   `08b62bfd2e5a8b057182768f16ed9436d88bc801cf2c0ed24b0787ce4725efa7`.
   The original 23-page file passed page-4 CVE/date and page-15–17
   recommendation checks via Poppler AND PDF.js.
2. User-provided Firefox/Cairo reprint tested privately:
   943,550 bytes; SHA-256
   `720fd20512cf88f02492f0c8dcc0f21ead2e48832586105bb95a2c82b1a6bcb0`.
   Page-4 rendered visual says `CVE-2023-23397`,
   `mars 2022` through `juin 2023`; the embedded Unicode map
   renders altered private-use digits in PDF.js/Poppler/PyMuPDF.
   French raster OCR recovered those identifiers in that tested page.
3. Read-only Supabase earlier identified two **different** 934 KB
   stored assets, hashes beginning `56dd936...` and `cc0a079...`.
   The indexed 934,357-byte copy had damaged private-use glyphs.
   The user-uploaded file is NOT byte-identical to these stored assets.
   No exact stored copy has yet passed the new v3 publication path.

No original/private PDF or full extracted text is committed to Git,
uploaded as a CI artifact, or logged.

## Provenance and epistemic boundary

- Original source: `source_assets` + original Storage object + source SHA.
- Extraction snapshot: separate, owner/project/source/asset-keyed run and
  immutable per-page original text + search alias + SHA + engine/version.
- Metadata extracted from PDF is **unverified**; the migration permits
  publisher/date/reference/TLP nullable. No LLM guesses, external page
  comparison or unreviewed TLP adjustment is promoted to truth.
- `COMPLETE` is a structural extraction-quality state, **not** evidence
  that every semantic claim is true. Only human-verified source-backed
  quotes can support a factual assertion.
- OCR output is provisional and `REVIEW_REQUIRED`. It cannot
  automatically publish authoritative lexical citations in v3.
- Old v2 `READY` indexes are not trusted if index_version, exact run
  identity or extraction quality are absent. They require source-SHA-
  checked reindexing; do not fabricate a bulk SQL backfill.
- `simple` FTS remains but receives an additional search-normalized
  alias index; multilingual embeddings are **Phase B**, not claimed here.

## Repeatability / test status

- `npm test -- tests/citem-extraction-manifest.test.ts tests/citem-phase-a-schema-contract.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Independent CI real original ANSSI PDF diagnostic and synthetic
  private-use glyph OCR integration are in PR #84 workflows.
- PostgreSQL executable migration + RLS/claim/race acceptance:
  **NOT RUN** by this audit. Static migration contract tests do not
  substitute for authenticated PostgreSQL-role tests.
- Production Vercel PDF/AI/browser interaction, private exact reprinted
  source reindex and UI navigation: **NOT RUN / NOT ACCEPTED**.
- No live Supabase migrations, destructive cleanup, paid OCR or merge
  executed in this scope.

## Mandatory gates before merge

1. Apply 066/067/068 in a disposable PostgreSQL environment; test
   ordinary authenticated roles, foreign owner, anon, service_role only,
   live SOURCE SHA drift, rollback, malformed duplicate pages, concurrent
   claim fences and reindex-from-old version.
2. Re-evaluate with the *exact* CITEM stored original bytes and original
   Storage authorization; 23/23 page coverage, quality, actual
   page-linked quotes, true 2022 date and identifiers.
3. Verify Vercel runtime does not claim OCR availability. OCR worker
   deployment is an explicitly **deferred BAYKUSH Node work item**.
4. Validate UI INDEX_UNAVAILABLE, REVIEW_REQUIRED and
   FALLBACK_CURRENT_PAGE; no corrupted excerpt may become verified.
5. Production migration-first rollout and deliberate rollback
   (newest migrations are forward-only); no merge without approval.
