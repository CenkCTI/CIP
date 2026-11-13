# Stage 4.1 M1A — Source Reliability (A–F)

**Scope:** The first independent implementation slice of Stage 4.1. It changes neither Canvas scene schemas nor Claims, Fusion, Attribution, Node, AI, monitoring, or publishing.

## Source of truth

- `sources.reliability` (legacy `HIGH/MEDIUM/LOW/UNKNOWN`) is untouched and is **not mapped** to the new grades.
- `source_reliability_reviews` records human evaluations of a **Source** on the A–F Admiralty source reliability axis. An absent row means **not evaluated**; `F` means **cannot be judged**.
- Information credibility (1–6) belongs to the source-specific **assertion** and will be implemented separately in M1B; analytic confidence belongs to a later human-approved analytic statement.
- `source_id` is an immutable subject identifier without a cascading Source FK. The RPC requires a live, owned Source row for **every new write**. If a Source is physically deleted, owner-only history and minimal identity snapshot remain (`UNAVAILABLE`). Deleting an entire Investigation follows the project privacy deletion lifecycle.
- The review snapshot stores only bounded title, publisher and source type; never PDFs, document contents, snippets, URLs, credentials, or signed Storage URLs.

## Persistence & authorization

Migration: `supabase/migrations/202611130081_stage4_1a_source_reliability_reviews.sql`.

RPC: `save_source_reliability_review_v1(project, source, A..F, rationale, methodVersion, expectedCurrentReviewId, requestId)`.

The RPC confirms `auth.uid()` and project owner, locks the Source row, verifies a current active Source, performs exact request idempotency, checks expected current review ID, and appends the new revision with server-assigned evaluator, timestamp, source revision and subject fingerprint. Competing writers serialize on the Source row. Previous reviews cannot be updated/deleted while their Investigation exists.

`authenticated` receives only `SELECT` (through owner RLS) and narrowly scoped RPC `EXECUTE`. `anon` and `PUBLIC` get no access. Production migrations/deployments require separate approval.

## HTTP contracts

- `GET /api/projects/[id]/analysis/quality/sources/[sourceId]?page=1`: source status, current review, review history (20/page), stale flag. Unknown/foreign Source => 404. All responses `no-store`.
- `POST /api/projects/[id]/analysis/quality/sources/[sourceId]/reviews`: strict `rating`, `rationale`, `methodVersion=ADMIRALTY_SOURCE_V1`, `expectedCurrentReviewId` nullable UUID, and `requestId` UUID. 201 created, 200 exact replay, 409 stale/reused request, 404 invisible Source, 400 invalid, 413 oversized, 503 DB unavailable. CSRF origin checking and JSON content type validation.

## Acceptance & release constraints

- CI: npm install/lint/typecheck/full Vitest/build; disposable PG16 **and PG17** migration test covering RLS, provenance, deletion, replay, revisions, conflicts, direct-writes denial.
- Staging browser: open source, create B, revise C, reload and inspect both versions; null review != F; source change warns stale; archived source disables writes; other user cannot read/write; no secret or source-content persistence.
- Canvas PRs #90 → #91 → #92 remain separate drafts and their staged browser/real BYOK acceptance is not bypassed. The existing live C3/C4 migration history must never be replayed blindly.
- **No production DB migration, PR auto-merge, or deployment** is performed by this development PR.
