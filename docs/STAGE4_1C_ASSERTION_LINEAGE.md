# Stage 4.1 M1C — Reporting Lineage / Independence

## Scope

Manual, owner-scoped, versioned relationships between **two Source Claim Assertions of the same canonical proposition**, not Canvas graph links. M1A scores the source A–F; M1B evaluates one assertion 1–6; M1C records whether apparent corroboration really stems from different primary observations.

- `CITES`: this assertion cites the other report (directional)
- `DERIVED_FROM`: this reporting derives from another assertion (directional)
- `SHARES_PRIMARY_SOURCE`: same underlying primary material
- `INDEPENDENT_OBSERVATION`: analyst-entered evidence and attestation of independent firsthand collection; never automatically inferred from separate URLs/hosts
- `UNCLEAR`: relationship cannot be established

**Every relation is analyst-reviewed evidence metadata, not verified ground truth.** The two selected assertions must belong to the *same Investigation and canonical Source Claim*. For independence they must also be different Source records and share the same explicit `ASSERTS`/`DENIES` stance. `QUALIFIES` and `UNCLEAR` are not automatic independent corroboration.

## Security and preservation

- Additive migration: `202611130083_stage4_1c_assertion_lineage.sql`. No Canvas, Node, reports, or Stage3 table alteration. RLS owner-only `SELECT`, authenticated-only definer RPC with explicit `auth.uid()`/project owner check; no direct authenticated mutations, anonymous execution blocked.
- `assertion_lineage_links` is append-only and revisions reference previous entries; immutable trigger rejects UPDATE/DELETE. After Stage3 unlinks an assertion, history survives with a small identity snapshot, no quote/full PDF/token/URL. Investigation privacy deletion cascades the history.
- Pair uniqueness uses an unordered UUID pair to prevent contradictory simultaneous records for A↔B, while each revision retains the **direction** of CITES/DERIVED_FROM. A correction creates a new revision, possibly with reversed direction.
- Request ID idempotency, expected current review ID, source/claim/annotation/assertion provenance timestamps, and ordered row locking prevent stale-tab overwrites. Server resolves all authoritative source IDs.
- `assertion_lineage_current_v1` is a `security_invoker` view, not a materialized trust score. Link history is paginated for one pair (20), current links capped at 100 and candidate set capped at 100; truncation is flagged.
- New M1B information credibility **grade 1** inserts must have a current `INDEPENDENT_OBSERVATION` review of the same pair, checked in a DB trigger. Existing historical M1B grade-1 reviews remain immutable; they are not rewritten. Earlier reviews must be re-evaluated manually as needed.

## UI and API

In Source Claim detail, open **Reporting lineage** on a source-position card. Select another assertion of the same Claim, choose relation, explain the reporting chain, save and examine revision history. The inspector is lazy-loaded and includes original source labels; it never writes a Canvas edge.

`GET /api/projects/{id}/analysis/lineage?assertionId={uuid}[&otherAssertionId={uuid}]` loads candidate assertion provenance, current links and optional 20 latest revisions for one pair. No-store, owner-only.

`POST /api/projects/{id}/analysis/lineage` expects exact validated keys: `fromAssertionId,toAssertionId,relation,rationale,expectedCurrentReviewId,requestId,expectedContext` (seven timestamps for the subject pair and shared Claim). 201 saved, 200 replay, 400 invalid evidence/relationship, 404 unauthorized/unavailable, 409 changed context/review, 503 infrastructure error. Stored source identities and author are computed in the DB, never accepted from the client.

## Caveats / follow-up

This first manual-lineage slice **does not compute transitive circular reporting or independently verify the analyst's attestation**. An A→B citation and B→C citation can still share upstream source C. A grade of 1 is an analyst-attested finding with a stronger review gate, not mathematical certainty. Future graph/lineage audits should highlight transitive dependency and re-evaluate stale grade-1 assessments without altering audit history.

## CI / release gates

- PostgreSQL 16/17 disposable acceptance: owner RLS, replay, same-source rejection, cross-Investigation, stale context, immutable revisions, unlink persistence, project privacy cascade, grade-1 guard.
- Next.js: lint, typecheck, Vitest, production build.
- Manual staging: same-source and copied-report relations, independent first-hand observation, change a source and retry stale submit, two-tab conflict, archived source, cross-Investigation, unlink retention, source position UI on mobile; historical grade-1 warning review; real source text comparison in Source Reader.
- The migration is **not applied to live Supabase by this PR**. Apply and verify it before merging and auto-deploying the M1C UI; do not replay existing Canvas/M1A/M1B migrations.
