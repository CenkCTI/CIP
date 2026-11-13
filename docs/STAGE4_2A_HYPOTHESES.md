# Stage 4.2 M2A — Working hypotheses and evidence role review

**Scope:** Working analyst hypotheses with explicit disconfirmation tests, append-only revisions, and analyst-assigned role reviews for individual Source Claim Assertions. This is neither a source-reported proposition (`source_claims`), a Source quality grade, a final analytic judgement, nor calibrated confidence. These domains remain distinct.

## UI flow

1. Investigation → Analysis → **Hypotheses** → Create working hypothesis (title, proposition, falsification/disconfirmation test, rationale).
2. Open the hypothesis; revise its proposition/test/status with a new immutable revision (`OPEN`, `TESTING`, `RETIRED`). A retired hypothesis accepts no additional evidence review.
3. Select an existing source-backed assertion, not a raw PDF or an AI-only candidate. Record `SUPPORTS`, `CONTRADICTS`, `CONTEXT`, or `WITHDRAWN` with a required explanation. Reassessments create immutable revisions; old findings are not deleted.
4. Inspect source snapshots and current/historical roles. If a Source Claim has been edited or unlinked, the historical link remains but is marked stale/unavailable. Individual evidence ratings and M1C reporting lineage must be interpreted separately.
5. No automatic conclusions, no hypothesis promotion to an Intelligence Product, no model-generated confidence, no automatic ACH aggregation.

## Security and data integrity

- Additive migration `202611130084_stage4_2a_hypothesis_workbench.sql`, creates three owner-only RLS tables, two `security_invoker` views, append-only history triggers, and two versioned, idempotent, owner-checked `SECURITY DEFINER` RPC writers with fixed search paths.
- API requests are strict Zod schemas, body-size capped, same-origin JSON, and owner-scoped. Direct authenticated table INSERT/UPDATE/DELETE and anonymous reads/writes are revoked.
- Hypotheses are not linked by FK to Stage 3 assertions: if a source position is unlinked the historical evidence role survives as a minimal snapshot. Privacy deletion of the parent Investigation cascades the records.
- The assertion's canonical Source, annotation and Claim are server-resolved. Expected provenance timestamps and optimistic current-version/review IDs prevent stale-tab writes. A source ID or AI-assigned truth grade provided in the body is rejected.
- Source independence is **not** inferred from multiple assertions, URLs, publications or role counts. M1C is the separate reporting-lineage control.

## Release gates

- PostgreSQL 16/17 disposable acceptance of RLS, no direct writes, project isolation, idempotency, stale revisions, evidence role changes, unlink retention and privacy deletion.
- ESLint, TypeScript, unit/API tests and Next.js production build.
- Authenticated browser QA: create, revise, attach contradiction, refresh, stale-tab conflict, retired hypothesis, source unlink, cross-Investigation ID, and source provenance changes.
- Apply SQL migration **before** deploying the feature to production. Do not rerun existing Canvas/M1A–M1C migrations.

## Known limitations / next slices

- M2A limits candidate selection to 100 recent source assertions per Investigation and explicitly signals truncation. Search, pagination and larger evidence collections follow in M2B.
- Hypothesis alternative grouping, ACH matrix, Key Assumptions Check, competing-hypothesis comparison, analytic judgments with confidence calibration, and Canvas promotion are later increments. No deterministic support/contradiction counts should be treated as probability or confidence.
- RLS/CI are necessary but **not** a substitute for real authenticated browser acceptance with Stage 3 data.
