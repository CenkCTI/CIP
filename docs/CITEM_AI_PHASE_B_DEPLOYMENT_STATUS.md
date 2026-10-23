# CİTEM AI — Phase B Deployment/Operations checkpoint (2026-10-23)

## Confirmed live Supabase state

Project reference: kouvokerievmlpykulpe. No user documents or credentials are checked into Git.

- Phase A forward-only migration 068: **applied**, schema migration registry
  version `20261023143811`, name `citem_document_extraction_manifest_068`.
  Git source: `supabase/migrations/202610230068_citem_document_extraction_manifest.sql`.
- Phase B forward-only migration 069: **applied**, registry version
  `20261023144329`, name `citem_multilingual_e5_vector_069`.
  Git source: `supabase/migrations/202610230069_citem_multilingual_e5_vector.sql`.
- pgvector `0.8.2` installed in `extensions` schema.
- Owner-scoped v3 page/extraction tables and semantic search RPC present.
- New embedding table initially had **zero** rows; no real vector model has
  yet been executed on a private source.
- Anonymous SELECT and RPC execute, normal-user INSERT: **false**.
  RLS: enabled; only owner/project SELECT policy; service-role write.
- Source identity invalidation: SQL excludes embeddings if original SHA
  differs from indexed source SHA. RPC returns zero for unauthorized request.
- Four legacy `READY` index rows exist; zero have versioned
  `COMPLETE` extraction. They are intentionally excluded from verified
  retrieval until owner-scoped exact original file reindex succeeds.
- These Supabase apply_migration registry timestamps are intentionally
  distinct from the Git migration filename prefixes. **Do not reapply the
  Git SQL files blindly** with a separate runner: reconcile migration state
  against registry and catalog before any future deployment.

## Implemented in PR #85 (DRAFT)

- TR→FR/EN lexical probes and model-independent RRF with exact identifier
  priority, source diversity and bounded candidate lists.
- E5-small **384-dimension** vector schema, exact cosine owner+SHA+revision
  filtered SQL RPC, and model contract tied to 40-hex immutable revision.
- Local-only OpenAI-compatible embedding HTTP client: strictly allowed
  server-configured hostname, authenticated HTTPS, bounded inputs and response
  validation, 20-second timeout; no embedding provider is enabled by default.
- `services/citem-embedding-worker/` Dockerized Python FastAPI worker using
  pinned `intfloat/multilingual-e5-small` model and normalized embeddings.
- Server route `POST /api/projects/{projectId}/ai/processing/semantic-index`
  requires authenticated owner, valid origin, source/asset UUIDs, explicit
  `approveLocalEmbedding:true` and bounded eight-chunk progress cursor.
- CİTEM Document Memory UI explicit local embedding opt-in and resumable
  controlled batching.
- Regular analyst retrieval accepts SQL-filtered semantic candidates ONLY
  when an allowed trusted local worker is actually configured; falls back to
  lexical-only on provider outage or empty vectors.
- Dedicated PostgreSQL16+pgvector owner/foreign-user/SHA-drift CI acceptance.

## What is NOT yet operational

- **The embedding worker is NOT deployed** on the Oracle/BAYKUSH server.
  Docker source exists, no reachable URL or secret configured.
- The real Hugging Face model immutable commit SHA must be verified and
  configured on BOTH worker and CİTEM runtime; no revision was invented.
- Vercel environment access in this session returned **403 Forbidden**
  for team/project scope. The user or team administrator needs to authorize
  the current Vercel connector scope before encrypted environment values
  can be provisioned and a deployed model enabled. Never place API keys
  into Git, CI logs or conversation.
- These env names need configuring AFTER worker deployment:
  `CITEM_SEMANTIC_RAG_ENABLED=1`,
  `CITEM_EMBEDDING_ENDPOINT=https://<trusted-host>/v1/embeddings`,
  `CITEM_EMBEDDING_ALLOWED_HOST=<same-host>`,
  `CITEM_EMBEDDING_MODEL_REVISION=<verified-40-hex-SHA>`,
  `CITEM_EMBEDDING_API_KEY=<random-operator-secret>`.
- No user PDF has been transferred to a third-party embeddings provider.
  No automatic consent/backfill migration was carried out.
- No 50–80 human-labeled multilingual question retrieval benchmark has
  been completed. No Recall@5 accuracy number is being claimed.
- Browser acceptance of actual owner-scoped PDF and model results,
  deployment capacity, live latency, and resource/cost checks remain.

## Production readiness gates

1. Complete all PR #85 CI and security checks; do not merge a failing build.
2. Deploy worker privately and verify correct real model revision/dimensions.
3. Authorize Vercel team access, set server-only env values, smoke API status.
4. On one owner-approved original CLEAN source, prepare full versioned
   extraction then embeddings, confirm owner positive/foreign negative.
5. ANSSI French page-3 TR strategic-purpose result, exact CVE, quote/page
   navigation, source glyph integrity, and no false attribution.
6. Run multilingual gold benchmark and evaluate local CPU/RAM/latency.
7. Only then enable feature flag in production and merge/release as approved.

No source data deletion, vector backfill, old index force-marking or live
service deployment occurred in this checkpoint.
