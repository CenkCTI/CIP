# Phase 2.3D — Taxonomy, Alias and Canonical Entity Normalization

## Purpose

Phase 2.3D adds an owner-scoped canonical TechINT identity layer above immutable Phase 2.3B source-backed entity assertions. The analyst should handle genuine identity exceptions, not clean every provider label manually.

The resolution flow is:

`source assertions → deterministic resolution → confirmed exact aliases → grouped unresolved identities → optional BYOK AI assessment → safe AI-verified link/bootstrap OR analyst exception review`

Phase 2.3D still does **not** perform profile matching, relevance scoring, Global Priority, Global View ranking, Investigation mutation, attribution, alerts, or AI-authored intelligence assessment.

## Trust boundary

The data layers remain separate:

1. **SOURCE ASSERTION** — immutable provider-backed/system-extracted source truth.
2. **CANONICAL ENTITY** — owner-global TechINT identity.
3. **ANALYTICAL ENTITY** — Investigation-scoped analyst record.
4. **AI ASSESSMENT** — bounded BYOK output that can be acted on only after independent server-side gates.

Phase 2.3D never rewrites provider labels, normalized source values, assertion basis, provenance, observation identity, or source snapshots.

## Database model

Migration `202608080037_phase2_3d_taxonomy_entity_normalization.sql` created the canonical foundation:

- `technical_entities`
- `technical_entity_aliases`
- `technical_entity_assertion_resolutions`
- `technical_entity_audit_events`

Migration 037 is already operator-applied and is immutable.

Migration `202608090038_phase2_3d_ai_verified_auto_resolution.sql` is additive and adds:

- resolution basis `AI_VERIFIED`
- audit action `ASSERTION_AI_AUTO_RESOLVED`
- service-role-only RPC `ai_resolve_technical_entity_assertion(...)`

Migration `202608090039_phase2_3d_ai_verified_canonical_bootstrap.sql` is additive and adds:

- canonical entity origin `AI_VERIFIED`
- audit action `ENTITY_AI_AUTO_CREATED`
- service-role-only RPC `ai_create_technical_entity_from_assertion(...)`

Migrations 037 and 038 are not edited by migration 039.

## Deterministic resolver

`reconcile_technical_entity_assertions(actor, limit)` remains bounded, non-networking and idempotent.

It automatically handles:

- CVE deterministic identity
- ATT&CK technique/sub-technique identity
- Indicator identity using existing CİTEM normalization
- exact ACTIVE confirmed aliases

Deterministic identity never depends on AI.

## Grouped exception review

Repeated unresolved labels are collapsed into conservative exact groups.

Example:

`5 × VENDOR = Google → one identity case`

The queue therefore represents identity decisions rather than individual provider rows.

## BYOK / NVIDIA NIM

Entity Resolution reuses the existing authenticated BYOK architecture:

- encrypted temporary HttpOnly `cip_byok` cookie
- authenticated user binding
- existing provider registry
- existing `byokChat` client
- NVIDIA NIM as the recommended/default provider
- existing OpenAI, OpenRouter and Groq options remain available

No new key store is introduced.

AI requests remain bounded to:

- entity kind
- observed label
- conservative normalized value
- occurrence count
- bounded source-system names
- semantic roles
- a few signal titles
- server-selected canonical candidates

The workflow does not send raw provider snapshots, Investigation Notes, Evidence, Reports, Intel Profile content, or unrelated user data.

## Suggestion-only endpoint

`POST /api/techint/entities/suggest`

This endpoint remains non-mutating. It may return:

- `MATCH_EXISTING`
- `CREATE_NEW`
- `UNSURE`

with a confidence band and bounded rationale.

A model-supplied candidate UUID must be one of the server-supplied candidates. Out-of-set candidate IDs fail closed.

The candidate query is scoped to ACTIVE canonical entities of the unresolved group kinds so a large deterministic CVE registry cannot hide relevant Vendor/Malware/Product candidates and cause false create suggestions.

## Guarded AI automation

`POST /api/techint/entities/auto-resolve-ai`

**AI confidence alone never authorizes a write.**

The route authenticates the user, reloads current unresolved groups and canonical candidates server-side, asks the connected BYOK model for a bounded assessment, validates the strict response, then independently evaluates structural gates.

The initial autonomous kinds remain deliberately conservative:

- `VENDOR`
- `MALWARE`
- `PRODUCT` only with corroborating non-conflicting context

Threat Actor and Campaign remain analyst-review only. CVE, Indicator and ATT&CK bypass AI and remain deterministic.

### Safe MATCH_EXISTING

An existing canonical entity may be linked automatically only when:

1. model decision is `MATCH_EXISTING`
2. confidence is `HIGH`
3. candidate UUID was supplied by the server
4. entity is ACTIVE
5. entity kind matches exactly
6. selected candidate has a strong lexical identity signal
7. exactly one strong candidate exists
8. no competing/duplicate strong candidate exists
9. label is not generic/provider-placeholder content
10. PRODUCT context is sufficiently corroborated and non-conflicting
11. assertion remains unresolved when the trusted RPC executes

Successful assertions are stored with resolution basis `AI_VERIFIED` and audited with `ASSERTION_AI_AUTO_RESOLVED`.

### Safe CREATE_NEW canonical bootstrap

A HIGH-confidence `CREATE_NEW` may now bootstrap a canonical identity when the registry has no safe existing match.

This exists specifically to avoid forcing an analyst to manually create obvious first-seen identities such as:

`VENDOR Google → canonical VENDOR Google`

All of the following must pass:

1. model decision is `CREATE_NEW`
2. confidence is `HIGH`
3. kind is enabled for guarded AI automation
4. no strong existing canonical candidate is available
5. observed label is not a generic/provider-placeholder value
6. proposed canonical name is not generic
7. proposed canonical name is exact-normalized or conservative compact-equivalent to the observed label
8. PRODUCT has exactly one corroborating parent/vendor context
9. no PRODUCT context conflict exists
10. trusted database RPC rechecks owner and current assertion state
11. trusted database RPC takes an advisory transaction lock
12. trusted database RPC rejects any ACTIVE exact/compact-equivalent existing entity before insert

Examples:

- `Google → Google` — eligible when all other gates pass
- `LummaStealer → Lumma Stealer` — eligible as conservative compact-equivalent naming
- `Google → Alphabet Google Cloud` — rejected
- `Core` with both WordPress and Drupal context — rejected
- `Multiple Products` — rejected

The new canonical entity is stored with origin `AI_VERIFIED`, audited with `ENTITY_AI_AUTO_CREATED`, and the current group is resolved against that entity with `AI_VERIFIED` resolution provenance.

## No automatic alias teaching

This remains a hard boundary.

AI automation may:

- link a current unresolved group to an existing canonical entity
- bootstrap one safe canonical entity and resolve the current group against it

AI automation may **not**:

- create or teach an alias
- mark an alias `ANALYST_CONFIRMED`
- rename/archive/restore an identity
- rewrite a source assertion
- create Investigation analytical entities
- create Intel Profile matches
- modify attribution
- create Graph relationships
- create Global Priority or ranking state

A wrong current-group decision has bounded impact. A wrong reusable alias can affect future reconciliation, so alias teaching remains an explicit analyst action.

## Generic labels

The bounded explicit denylist includes:

- `Multiple Products`
- `Various Products`
- `Unknown`
- `Other`
- `Multiple Versions`
- `Multiple Devices`
- `All Versions`

These source assertions are preserved. They simply cannot be automatically canonicalized.

## Compact case UI

The analyst queue is intentionally compact.

A collapsed case row exposes only operational decision information such as:

- triangle disclosure control
- case number
- entity kind
- observed name, e.g. `Google`
- occurrence count
- source-system count
- AI confidence when available
- direct resolve/create and explicit alias-teaching buttons when an AI suggestion exists

The analyst can use the triangle to expand the case downward. Expanded details include:

- source systems
- observed semantic role
- bounded context snapshot
- AI decision/rationale
- review-stop reason
- manual existing-entity and create-new controls
- technical group identity details

This keeps the normal queue scan dense while preserving evidence on demand.

## Audit and security

AI-created canonical identities are not recorded as analyst-created identities. Their origin is `AI_VERIFIED`.

AI-linked assertions use `AI_VERIFIED` resolution basis.

The audit trail distinguishes:

- `ENTITY_AI_AUTO_CREATED`
- `ASSERTION_AI_AUTO_RESOLVED`

Audit metadata may contain bounded non-secret values such as provider, model, HIGH confidence, decision type and structural safety flags.

It never stores:

- API key
- full prompt
- raw model response
- raw provider snapshot

Both AI mutation RPCs are service-role-only. `anon` and `authenticated` cannot execute them directly.

## Testing

Focused TypeScript/static tests cover:

- HIGH unique existing match
- HIGH safe Google-style canonical bootstrap
- conservative `LummaStealer → Lumma Stealer` bootstrap
- MEDIUM/LOW rejection
- competing candidate rejection
- hallucinated candidate rejection
- inactive/kind mismatch rejection
- CREATE_NEW rejection when a strong existing candidate exists
- materially changed canonical-name rejection
- PRODUCT context requirement
- WordPress/Drupal `Core` conflict
- generic-label rejection
- deterministic bypass
- Threat Actor/Campaign autonomous-resolution exclusion
- no alias teaching
- compact expandable case UI
- trusted workflow boundaries
- no Investigation/profile/priority mutation

PostgreSQL 16 harnesses verify:

- migration 038 AI link provenance and ACLs
- migration 039 `AI_VERIFIED` entity origin
- `ENTITY_AI_AUTO_CREATED` audit
- no alias row from AI bootstrap
- source assertion immutability
- same-label group reuse of the bootstrapped entity
- generic-name rejection
- materially different-name rejection
- duplicate canonical bootstrap rejection
- cross-owner isolation
- browser-role execute denial
- service-role execute grant

## Deployment procedure

Migration 037 must **not** be reapplied.

Migrations 038 and 039 are operator-controlled additive migrations. The implementation agent does not apply them remotely.

For an environment where neither is present, the authorized operator applies:

1. migration 038 once
2. migration 039 once
3. `NOTIFY pgrst, 'reload schema';`
4. redeploy/reload Preview if needed
5. connect NVIDIA NIM BYOK
6. run `Analyze & auto-resolve safe groups`
7. verify safe existing matches resolve
8. verify obvious first-seen identities such as Google can bootstrap once and disappear from the queue
9. verify generic/conflicting/uncertain cases remain review-only
10. verify no alias is automatically created
11. verify source assertions remain unchanged
12. verify audit and second-user isolation

If migration 038 is already present in the target environment, apply only migration 039. Never re-run migration 037.

## Explicit exclusions

Phase 2.3D still excludes:

- autonomous alias creation
- broad AI ontology generation
- authoritative external vendor/product taxonomy ingestion
- MITRE ATT&CK TAXII/source ingestion
- URLhaus/new provider work
- vector/embedding persistence
- profile matching and relevance scoring
- Global Priority / Global View ranking
- alerts/discovery
- AI intelligence briefs
- automatic Investigation analytical entities or Graph links

PR #30 remains separate and untouched.

## Phase 2.3E handoff

Phase 2.3E may consume:

`resolved Technical Signal assertions + canonical entities + Intel Profile definitions`

for matching, relevance and priority.

`AI_VERIFIED` is identity-resolution provenance. It is not attribution judgement, threat confidence, business risk, or intelligence-assessment confidence.
