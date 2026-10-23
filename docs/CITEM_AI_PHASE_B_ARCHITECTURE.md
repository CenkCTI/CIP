# CITEM AI Phase B — Multilingual Hybrid RAG

## Verified status (2026-10-23)

- PR #84 merged into main at 4e306fa9b1464f4023dff1aa2eb2c24d806b6c2a.
- Phase A supports SHA-verified complete extraction and owner-scoped lexical retrieval.
- Read-only Supabase query: vector extension available as 0.8.2 but NOT INSTALLED (installed_version NULL).
- Live schema-migration registry did not confirm 066/067/068; do not assume live deployment.
- No approved embedding model runtime, private-content consent or budget was established.
- Gold set of 50–80 independently reviewed questions: NOT RUN.

## B1 Retrieval architecture

Question → exact identifier extraction → bounded lexical TR/FR/EN probes → authenticated, owner/project-filtered SQL → optional semantic candidate SQL → RRF → dedup and grounded source/page evidence.

SQL must enforce owner, project, source/asset, exact current SHA, READY/COMPLETE index version and source policy BEFORE candidate LIMIT. RRF code is an additional ranking layer, NOT a database authorization control.

Probes are only search hypotheses; they are not translated quotations or evidence. A query for CVE-2023-23397 must preserve that literal identifier. Existing LEXICAL_ONLY fallback remains accurate when vector search is unavailable.

RRF starts with candidate top-30 per channel, k=60 and result cap 12, with exact literal identifier priority and source diversity. All parameters await actual multilingual recall and latency benchmarks.

## B2 Provider and confidentiality decision

EmbeddingProvider tracks exact provider, model ID and revision, dimensions, metric, normalization, model input cap and LOCAL/EXTERNAL processing. Query and chunk embeddings must share one compatible revision; malformed/nonfinite/wrong-dimension vectors are rejected.

EXTERNAL mode requires explicit document transfer permission and source-policy approval as well as an enabled semantic feature. LOCAL mode also requires semantic feature enablement. All flags default to disabled until integrated with the runtime.

Research candidate ONLY: intfloat/multilingual-e5-large. Published model card indicates 1024 dimensions, prefix conventions query:/passage: and at most about 512 input tokens. The model is NOT selected or deployed pending TR–FR–EN benchmark, local hosting capacity and consent evaluation.

Model card: https://huggingface.co/intfloat/multilingual-e5-large
Supabase reference: https://supabase.com/docs/guides/ai/hybrid-search

## B3 Database design (NOT MIGRATED)

After provider benchmarking and approval, add a new versioned owner-scoped embedding table keyed by source SHA, current extraction run/chunk, model/revision/dimensions and project/owner; use pgvector with verified dimensions. Start with exact cosine, benchmark before HNSW. Strict RLS and source filtering must occur inside the vector RPC before top-k. No changes to existing 066–068 migrations.

## B4 Acceptance gates

1. Build 50–80 independently reviewed multilingual gold questions spanning ANSSI and additional documents, contradictions, broken PDFs, exact identifiers and zero-result cases.
2. Benchmark Recall@5/12, identifier recall, real quotes/source/page, negative cross-tenant cases, p50/p95 retrieval cost and latency. A 90% Recall@5 is a GOAL, not an observation.
3. Test timeout, provider unavailability, wrong model revision/dimension, denied consent and source SHA drift.
4. Verify test-database RLS before any production migration or external model processing; production writes require explicit permission.
5. Confirm CITEM browser source navigation and fail-closed lexical fallback with an authorized real document.

## Initial delivered slice

- src/lib/ai/stage3/embedding-provider.ts: strict provider contract and consent predicates.
- src/lib/ai/stage3/hybrid-retrieval.ts: provenance-aware deterministic RRF.
- src/lib/ai/stage3/multilingual-query-plan.ts: TR→FR/EN lexical aliases and exact-ID preservation.
- src/lib/ai/stage3/indexed-investigation-memory.ts: owner-scoped lexical probe integration.
- tests/citem-phase-b-hybrid-retrieval.test.ts + tests/citem-phase-b-multilingual-query.test.ts.

Provider deployment, pgvector migration, real vector retrieval, reranker and final gold benchmark are NOT yet implemented or passed.