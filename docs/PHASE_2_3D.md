# Phase 2.3D — Taxonomy, Alias and Canonical Entity Normalization

## Purpose

Phase 2.3D adds an owner-scoped canonical TechINT entity layer above immutable Phase 2.3B source-backed entity assertions. The analyst should resolve identity exceptions, not clean every source record.

The current workflow is:

`source assertions → deterministic resolution → confirmed exact aliases → grouped ambiguous review → optional BYOK AI assessment → safe AI-verified auto-link or analyst review`

Phase 2.3D still does **not** perform profile matching, relevance scoring, Global Priority, Global View ranking, Investigation mutation, attribution, alerts, or AI-authored intelligence assessment.

## Trust boundary

The data flow remains separated:

`external source → Technical Signal → immutable observation → immutable entity assertion → Phase 2.3D resolution`

A source assertion remains source truth. Phase 2.3D never rewrites provider labels, normalized values, assertion basis, provenance, observation identity, or source snapshots.

The layers are distinct:

1. **SOURCE ASSERTION** — immutable source-backed/system-extracted observation context.
2. **CANONICAL ENTITY** — owner-global TechINT identity.
3. **ANALYTICAL ENTITY** — Investigation-scoped analyst record.
4. **AI ASSESSMENT** — optional BYOK output used only as one input to guarded resolution.

Canonicalization never creates or mutates Investigation analytical records.

## Database model

Migration `202608080037_phase2_3d_taxonomy_entity_normalization.sql` created:

- `technical_entities`
- `technical_entity_aliases`
- `technical_entity_assertion_resolutions`
- `technical_entity_audit_events`

Migration 037 is already operator-applied and is immutable.

Migration `202608090038_phase2_3d_ai_verified_auto_resolution.sql` is additive. It adds:

- resolution basis `AI_VERIFIED`
- audit action `ASSERTION_AI_AUTO_RESOLVED`
- service-role-only RPC `ai_resolve_technical_entity_assertion(...)`

Migration 038 does not add an AI-secret table, model-output table, alias table, or autonomous entity-creation path.

## Deterministic resolver

`reconcile_technical_entity_assertions(actor, limit)` remains bounded, non-networking and idempotent.

It automatically handles:

- CVE deterministic identity
- ATT&CK technique/sub-technique identity
- Indicator identity using existing CİTEM normalization
- exact ACTIVE confirmed aliases

Deterministic resolution does not call BYOK or any external provider.

## Grouped analyst review

Unresolved ambiguous assertions are grouped by conservative exact identity value rather than rendered one source assertion at a time.

Example:

`147 × VENDOR = Microsoft → one review group`

Each group carries only bounded context such as occurrence count, source systems, semantic roles and a few signal titles.

## BYOK / NVIDIA NIM

Entity Resolution reuses the existing authenticated BYOK architecture:

- encrypted temporary HttpOnly `cip_byok` cookie
- authenticated user binding
- existing provider registry
- existing `byokChat` client
- NVIDIA NIM as the recommended/default UI provider
- OpenAI, OpenRouter and Groq remain available

The API key is never persisted in Technical Signals, canonical entities, aliases, resolutions, audit rows, source cursors, or browser-readable state.

AI requests remain bounded to:

- entity kind
- observed label
- conservative normalized value
- occurrence count
- bounded source-system names
- semantic roles
- a few signal titles
- server-selected existing canonical candidates

Raw provider snapshots, Investigation Notes, Evidence, Reports and Intel Profile data are not sent.

## Suggestion-only endpoint

`POST /api/techint/entities/suggest`

This endpoint remains non-mutating. It can return:

- `MATCH_EXISTING`
- `CREATE_NEW`
- `UNSURE`

with a confidence band and bounded rationale.

A model-supplied candidate UUID must be one of the server-supplied candidates. Out-of-set IDs fail closed to `UNSURE`.

## Guarded AI auto-resolution

`POST /api/techint/entities/auto-resolve-ai`

This is a separate authenticated workflow. It may link current unresolved assertions to an **already-existing canonical entity** only after the server independently validates every safety gate.

**AI confidence alone never authorizes a write.**

All of the following must pass:

1. model decision is `MATCH_EXISTING`
2. model confidence is `HIGH`
3. candidate ID was supplied by the server
4. candidate is ACTIVE
5. candidate kind exactly matches the group kind
6. selected candidate has a strong lexical identity signal
7. exactly one strong candidate exists
8. no duplicate/competing strong candidate exists
9. label is not a bounded generic/provider-placeholder value
10. PRODUCT context is not contradictory
11. kind is enabled for guarded AI auto-resolution
12. assertion is still unresolved/current when the trusted RPC runs

Initial autonomous kinds are deliberately conservative:

- `VENDOR`
- `MALWARE`
- `PRODUCT` only when context is unambiguous

Threat Actor and Campaign remain analyst-review only in this phase.

Deterministic kinds (`CVE`, `INDICATOR`, `ATTACK_TECHNIQUE`) bypass AI and continue through the deterministic resolver.

## Generic labels

A bounded explicit rule set blocks provider placeholders such as:

- `Multiple Products`
- `Various Products`
- `Unknown`
- `Other`
- `Multiple Versions`
- `Multiple Devices`
- `All Versions`

These values are never silently discarded; their immutable source assertions remain intact. They simply cannot be AI-auto-canonicalized.

## Product context conflicts

PRODUCT auto-resolution fails closed when the bounded context shows materially different parent/vendor contexts.

Example:

- `WordPress Core ...`
- `Drupal Core ...`

for observed PRODUCT `Core` remains analyst review even if a model returns HIGH confidence.

## What AI automation may do

Allowed after all gates pass:

`current unresolved group → existing canonical entity`

The database records:

- resolution basis `AI_VERIFIED`
- dedicated append-only `ASSERTION_AI_AUTO_RESOLVED` audit event
- bounded provider/model/confidence/safety-check metadata

## What AI automation may NOT do

It never automatically:

- creates a canonical entity
- creates or teaches an alias
- renames/archives/restores an entity
- rewrites source assertions
- creates Investigation entities
- creates profile matches
- changes attribution
- creates Graph relationships
- creates Global Priority/ranking state

`CREATE_NEW` AI proposals always stay analyst-review only.

## Why aliases remain analyst-controlled

A wrong current-group link has bounded impact. A wrong reusable alias can poison future reconciliation.

Therefore guarded AI automation always writes with **no alias**. Alias teaching stays explicit through the existing analyst actions:

- Confirm & teach exact alias
- Link & remember exact alias
- Create & remember exact alias

Alias revocation behavior remains unchanged.

## Audit and security

Migration 038 adds a narrow service-role-only trusted RPC. Authenticated browser roles cannot execute it directly.

The RPC rechecks:

- owner
- current assertion
- current resolution state
- entity ACTIVE status
- same entity kind
- enabled AI-auto kind
- generic-label denylist

The route performs the broader candidate/conflict/context safety gates before invoking the RPC.

Audit stores bounded non-secret metadata such as provider, model, `HIGH`, `MATCH_EXISTING`, `autoResolution=true`, and structural safety flags.

It never stores:

- API key
- entire prompt
- raw model response
- raw provider snapshot

Source assertions and audit rows remain append-only under the existing Phase 2.3B/2.3D protections.

## UI

`/techint/entities` keeps the current CİTEM AppShell, sidebar, BAYKUSH top bar and existing color system.

The AI panel offers two distinct actions:

- **Analyze next 8 groups** — suggestion only, no write
- **Analyze & auto-resolve safe groups** — guarded AI assessment plus server-side safety gates

The result report shows:

- analyzed groups
- auto-resolved groups
- groups still needing review
- generic labels
- conflicts
- unsure cases

Remaining cards may show why CİTEM stopped, for example:

- conflicting product context
- multiple strong candidates
- generic provider label
- confidence below HIGH

The existing manual resolution controls remain available.

## Testing

Focused tests cover:

- HIGH + unique strong same-kind candidate eligibility
- MEDIUM/LOW rejection
- multiple-candidate rejection
- hallucinated candidate rejection
- inactive/kind-mismatch rejection
- PRODUCT `Core` WordPress/Drupal conflict rejection
- generic-label rejection
- `CREATE_NEW` never auto-creates
- deterministic kinds bypass AI
- Threat Actor/Campaign remain disabled for auto-resolution
- no automatic alias teaching
- truthful `AI_VERIFIED` / audit semantics
- owner/service-role boundaries
- immutable source assertions
- no analytical/profile/priority side effects
- NVIDIA NIM default and existing manual controls

The existing PostgreSQL 16 Phase 2.3D harness is extended so migration 038 is applied in sequence and the AI-verified RPC, audit basis, no-alias behavior and ACLs are validated.

## Deployment procedure

Migration 037 must **not** be reapplied.

Migration 038 is an operator step and must not be applied remotely by the implementation agent.

After explicit operator authorization:

1. apply migration 038 once to the intended Preview/test Supabase
2. reload PostgREST schema cache
3. redeploy Preview if required
4. connect NVIDIA NIM BYOK
5. run suggestion-only mode first if desired
6. run **Analyze & auto-resolve safe groups**
7. verify obvious safe matches are linked with `AI_VERIFIED`
8. verify generic/conflicting/uncertain groups remain in analyst review
9. verify no alias/entity/Investigation/profile/priority side effect occurs
10. verify second-user isolation and audit metadata

## Explicit exclusions

Phase 2.3D still excludes:

- autonomous canonical entity creation
- autonomous alias creation
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

`resolved Technical Signal entity assertions + canonical entities + Intel Profile definitions`

for matching, relevance and priority. `AI_VERIFIED` is a resolution provenance basis, not an attribution judgement or analytical confidence score.
