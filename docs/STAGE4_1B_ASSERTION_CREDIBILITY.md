# CİTEM Stage 4.1 M1B — Source Assertion Information Credibility

**Scope:** the credibility of *what an individual source asserts* (1–6), NOT the source's reliability (A–F), aggregate Source Claim truth, attribution, confidence, or a Canvas promotion. Builds on the Stage 3 Source Claim/Assertion and M1A Source Reliability layers. Does not mutate legacy `sources.reliability`, Canvas, Source Claims or Source Reader content.

## UX

Open an Investigation → **Source Claims** → choose a Source Claim → expand **Information credibility · 1–6 evaluation** on one particular source-position card. The panel loads lazily to avoid a request for every assertion and displays source A–F and information 1–6 separately. It shows the immutable assessment history, stale provenance indicators, and a link already present in the parent card to the original Source Annotation.

- Absent review = **Not evaluated**. Review **6 = Cannot be judged** (not automatically false). A grade-A source does not imply information grade-1.
- Grades 2–6 require a 10–4,000-character human rationale; source reporting independence is explicitly UNKNOWN, PRIMARY_OBSERVATION, SECONDARY_REPORT, or ANALYST_VERIFIED_INDEPENDENT. These are analyst-entered origins/attestations, not inferred by machine or inferred from source count.
- For **1**, require another assertion **of the same claim and stance** from a **different source**, a detailed credibility rationale (at least 60 characters), and a separate human explanation (at least 40 characters) of why the reports are independently obtained. All checks are repeated against authoritative rows inside the PostgreSQL RPC. This is a constrained interim attestation before the M1C lineage graph; it is **not proof** that underlying observations are factually independent.
- A review change always creates a new revision; the previous assessment is never overwritten. If source/claim/annotation/assertion changes after the review, the panel displays a stale notice.
- If Stage 3 deletes the original assertion, the historical review remains readable at its endpoint. Only intentional Investigation deletion purges its private history.

## Database

`supabase/migrations/202611130082_stage4_1b_assertion_credibility_reviews.sql` adds table `assertion_credibility_reviews`, policy `assertion_credibility_reviews_select_owned` and RPC `save_assertion_credibility_review_v1`.

- Composite `(project_id, assertion_id, revision)` uniqueness, `supersedes_id`, four-timestamp provenance optimistic locking, request idempotency (`request_id` + server-computed input SHA-256), row lock, conflict detection, immutable trigger, minimum-grant RLS.
- Server stores only **bounded** identity snapshot plus source/claim/annotation/assertion update timestamps, never raw quotes, PDF blobs, signed URLs or asset keys. Historical identity is not a substitute for original evidence; it serves auditability only.
- No FK to mutable/deletable assertion, claim or Source; FK to project cascades for privacy deletion. Only authenticated users can call the owner-checked definer RPC; anonymous and authenticated roles cannot directly insert, update, or delete reviews.
- Corroboration is **explicit**, never inferred from number of links/Canvas arrows/AI. M1C will implement actual provenance lineage and circular-reporting checks; it should not rewrite these existing historical assessments.

## API

- `GET /api/projects/{id}/analysis/quality/assertions/{assertionId}?page=1`: current source quality and assertion credibility, missing/archived/unavailable subject, history in pages of 20, whether review is stale. Owner-scoped; private no-store.
- `POST /api/projects/{id}/analysis/quality/assertions/{assertionId}/reviews`: strict JSON payload `{ credibility, rationale, independenceStatus, independenceRationale, verificationAssertionId, methodVersion: "ADMIRALTY_INFORMATION_V1", expectedCurrentReviewId, expectedProvenance, requestId }`. Returns 201 on creation, 200 for exact replay, 409 stale/reused key, 404 unauthorized/missing, 400 invalid or unverified corroboration, 503 unexpected DB error.

## Deploy gates

1. Review PR #93 and M1A migration, which is already applied to live Supabase. M1B is a **dependent PR** and should merge only after PR #93 is merged, reviewed, and accepted.
2. Do not deploy app code before the matching M1B migration; otherwise the new read/write endpoints will fail. Migration application to production requires explicit change authorization and a preflight; this PR only adds the SQL file and tests.
3. CI: ESLint, TypeScript, full Vitest, Next build, disposable PostgreSQL 16/17 integration acceptance. Stage real-browser verification remains outstanding before release: new grade-3, 6, grade-1 corroboration + denial and same-source rejection, two-tab conflict, history pagination, edited-claim stale warning, cross-Investigation access, unlink retention, mobile layout, no console errors.
4. Review existing exposed `SECURITY DEFINER` functions separately; changes are not bundled into M1B. Neither M1B nor M1A is an automatic system for classifying facts as true.
