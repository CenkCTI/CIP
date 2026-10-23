# CİTEM AI baseline audit — 2026-10-23

## Verified scope (PR #83 prior to fix)
- Repository: CenkCTI/CIP, `feat/unified-investigation-memory-rag`.
- Initial head: `c328e378aef34aa8c7ff3d81047bf36e72f54091`.
- Base: `ac5bce21a005a4604c6101623571586a9b1ca5d4`. PR was open, Draft, mergeable.
- GitHub validation check at initial head: success; NODE-6/7 acceptance: skipped; Vercel: success. No real PDF/model acceptance implied.
- Connected CIP Supabase: Postgres 17.6.1, migration history has 064, 065 and 066; all three Copilot derived-text tables have RLS enabled. Authenticated can SELECT but not modify them; anon has no direct SELECT. There are 0 document index records (read-only count).
- `pgvector` not installed. Do **not** select an embedding dimension or enable provider billing without provider evaluation and consent.

## Confirmed defects
1. `context.ts` readAsset projection excluded `sha256`, while the indexer requires it: `invalid_index_source` + hidden fallback.
2. PostgreSQL `simple` FTS is lexical and does not provide TR/FR semantic similarity. The initial Turkish question had no evidence-based guarantee of retrieving French `espionnage`.
3. Initial index publication used several independent writes and trusted chunk counts without a committed transaction.
4. Analyst Chat masked index/retrieval errors and could silently fall back to the selected page.
5. Quote-substring validation does not establish semantic claim entailment. This is **not** fixed by PR #83.

## Official gold document (public TLP:CLEAR)
- Source: https://www.cert.ssi.gouv.fr/cti/CERTFR-2023-CTI-009/
- PDF: https://www.cert.ssi.gouv.fr/uploads/CERTFR-2023-CTI-009.pdf
- Verified via official PDF text and page rendering: 23 pages; page 2 Sommaire; page 3 Résumé. `APT28`, `26 octobre 2023`, `CERTFR-2023-CTI-009`, `espionnage` are present.
- Reported prior `APT28→88` / `26→16 octobre` distortions have **not** been localized to PDF extraction, context packing or model output. Do not autocorrect original text.

## Reproducible test commands
```bash
npm ci
npx vitest run tests/copilot-unified-investigation-memory.test.ts
npm run typecheck
npm run lint
bash scripts/test-stage3-processing-foundation-migration.sh
```
The PostgreSQL test needs its normal PG16+ fixture server/permissions. The 23-page operator-run browser/model test additionally needs an authorized investigation, original PDF upload and an intentionally enabled model provider. No private document is to be sent to an external embedding service automatically.

## PR-83-FIX changes and limits
- Asset SHA projection, explicit source failure warnings and a conservative TR/FR lexical search alias.
- Forward-only migration 067 provides service-role-only lease-token guarded transactional publication with full page coverage verification. This replaces multi-statement chunk writes.
- The existing v1 SQL functions/066 history remain intact; deployment must apply 067 **before** relying on the new indexer.
- The lexical expansion is **not** multilingual semantic search; token/page references remain original.
- Publication is bounded to 2.4MB serialized JSON and 1500 chunks. Oversized files produce a visible indexing error, not READY.
- **Unrun gates**: real browser/PDF acceptance, real-model evaluation, PostgreSQL 067 live-schema compatibility, adversarial RLS under authenticated roles, 50–80 gold-question Recall@5, 23-page extraction metrics.
- Migration 067 is committed to GitHub only, NOT applied to production.
- Rollback: stop new indexing, use legacy source reader/page context, retain original PDFs, chunks and audit events. Do not drop derived tables without retention approval.

## Later PR dependencies
A: separate extracted-original/quality/manifest and page diagnostics (forward-only migration as required).
B: optional multilingual vector/lexical RRF, model version and explicit consent; `pgvector` is not yet installed.
C: distinguish quote match from entailment, classify source assertion vs inference, link hypothesis IDs to reviewed evidence.
D: durable hypothesis version memory, intent routing and approved/SSRF-safe fetched web evidence.
E: threat model, 50–80 human-reviewed gold questions, PG RLS/adversarial tests, timing/cost and canary rollback.
All require separate review and none may silently authorize production migrations or external document transfer.

## PostgreSQL lexical control (read-only, 2026-10-23)
A source-style French sentence containing `APT28` and `espionnage` was queried using PostgreSQL `simple`: `stratejik amaç` = no match, `espionnage` = match, `APT28` = match. This verifies a lexical-language mismatch on a synthetic sentence; it is not an end-to-end PDF retrieval benchmark.
