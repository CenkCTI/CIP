# Phase 2.3D — Taxonomy, Alias and Canonical Entity Normalization

## Purpose

Phase 2.3D introduces an owner-scoped canonical TechINT entity layer above immutable Phase 2.3B source-backed entity assertions. Its job is to turn repeated source labels into stable canonical identities without making the analyst manually clean every observation.

The preferred workflow is now hybrid:

`source assertions → deterministic/known-alias auto resolution → exact unresolved grouping → optional BYOK AI candidate suggestion → explicit analyst confirmation`

Phase 2.3D still does **not** perform profile matching, relevance scoring, Global Priority, Global View ranking, Investigation mutation, attribution, alerts, or AI-authored intelligence assessment.

## Trust boundary

The data flow remains separated:

`external source → Technical Signal → immutable observation → immutable entity assertion → Phase 2.3D resolution`

A source assertion remains source truth. Phase 2.3D never rewrites `technical_signal_entity_assertions.display_value`, `normalized_value`, `assertion_basis`, source provenance, or observation identity.

The layers remain distinct:

1. **SOURCE ASSERTION** — immutable source-backed or system-extracted context attached to an exact Technical Signal observation.
2. **CANONICAL ENTITY** — owner-global TechINT identity used by later matching and prioritization.
3. **ANALYTICAL ENTITY** — Investigation-scoped Threat Actor, Malware, Campaign, CVE, Indicator, MITRE, or Infrastructure records controlled by an analyst.
4. **AI SUGGESTION** — optional, ephemeral BYOK-generated proposal for an unresolved group. It is not source truth, not an alias, and not a saved resolution until the analyst explicitly confirms it.

Canonicalization never creates or mutates analytical Investigation records.

## Why project CTI records are not the TechINT taxonomy

Existing `threat_actors`, `malware`, `campaigns`, `cves`, `indicators`, and `mitre_techniques` rows are project/Investigation scoped. Their names, aliases, families, and relationships may encode local analytical judgement. They are therefore not promoted automatically into an owner-global taxonomy.

Likewise, `intel_profile_items.normalized_value` is a profile-local normalized value, not a global canonical entity ID.

Project `threat_actors.aliases`, `malware.family`, campaign names, and similar Investigation strings are not silently globalized into Phase 2.3D aliases.

## Database model

Migration `202608080037_phase2_3d_taxonomy_entity_normalization.sql` adds four owner-scoped tables:

- `technical_entities`
- `technical_entity_aliases`
- `technical_entity_assertion_resolutions`
- `technical_entity_audit_events`

No extra AI-secret or AI-suggestion table is introduced. BYOK suggestions are ephemeral until an analyst explicitly confirms a grouped resolution through the existing trusted mutation boundary.

### `technical_entities`

Stores owner-global canonical identity.

Deterministic entity kinds are:

- `CVE`
- `ATTACK_TECHNIQUE`
- `INDICATOR`

Their deterministic keys reuse the existing Phase 2.3B identity contract:

- `cve:CVE-YYYY-NNNN...`
- `attack:Txxxx`
- `attack:Txxxx.xxx`
- `indicator:<TYPE>:<canonical-value>`

For these kinds, deterministic identity is immutable and owner-unique.

Ambiguous/name-based kinds such as Threat Actor, Malware, Campaign, Vendor, Product, Sector, Country, Region, Infrastructure, and Tag use UUID identity. Equal normalized names are not declared equivalent automatically and are intentionally not globally unique.

### `technical_entity_aliases`

Aliases are confirmed equivalence mappings, not raw provider strings.

Alias bases:

- `ANALYST_CONFIRMED`
- `AUTHORITATIVE_SOURCE`

Normal analyst workflows can create only `ANALYST_CONFIRMED` aliases. `AUTHORITATIVE_SOURCE` exists for future verified authoritative taxonomy ingestion and requires exact source provenance. Phase 2.3D does not fabricate MITRE aliases or scrape external taxonomies.

Only one ACTIVE alias for one owner + entity kind + conservative normalized value can resolve at a time. Conflicting reassignment fails closed.

### `technical_entity_assertion_resolutions`

Stores the current resolution state for an immutable source assertion.

Statuses:

- `RESOLVED`
- `NEEDS_REVIEW`
- `DISMISSED`

Resolution bases:

- `DETERMINISTIC_KEY`
- `CONFIRMED_ALIAS`
- `AUTHORITATIVE_ALIAS`
- `ANALYST_LINK`
- `ANALYST_CREATED`

Exactly one current resolution row exists per owner/assertion.

An analyst can link an assertion to an entity without teaching a reusable alias. Remembering an alias is a separate explicit decision. Grouped review preserves the same rule: **Confirm current group** and **Confirm & teach exact alias** are separate actions.

### `technical_entity_audit_events`

Append-only bounded audit history records canonical entity lifecycle, alias confirmation/revocation, automatic resolution, analyst resolution, dismissal, and reset-to-review events. Raw provider payloads, credentials, cursors, lease material, and unbounded source data are not stored in the audit table.

## Automatic resolver

`reconcile_technical_entity_assertions(actor, limit)` remains the deterministic, non-networking resolver with a 1–500 assertion bound.

It handles:

- CVE deterministic identity;
- ATT&CK technique/sub-technique deterministic identity;
- Indicator deterministic identity using existing CİTEM normalization;
- exact ACTIVE confirmed aliases.

It does not call BYOK, NVIDIA NIM, another model, or another provider. A taxonomy failure therefore remains isolated from Technical Signal collection.

An ambiguous provider string alone never creates a canonical entity.

## Grouped exception review

The previous raw-assertion review experience was not sufficiently scalable. `/techint/entities` now groups unresolved ambiguous assertions by:

`entity kind + conservative exact normalized value`

For example, 147 unresolved `VENDOR = Microsoft` assertions are presented as one review group rather than 147 analyst tasks.

Each group shows a bounded occurrence count, source systems, semantic roles, and a few signal titles for context.

Resolved and dismissed assertions are excluded from ordinary review groups. Deterministic CVE/Indicator/ATT&CK assertions are routed to the automatic resolver rather than analyst cleanup.

## Candidate discovery

For optional AI assistance, CİTEM first narrows existing canonical entities to a bounded candidate list of the same entity kind.

Candidate shortlisting may use lightweight lexical similarity only to reduce the candidate set sent to the model. This shortlist is **non-authoritative** and never resolves an assertion by itself.

Punctuation-stripped or compact forms such as `LummaStealer` and `Lumma Stealer` may therefore appear near each other as candidates, but they are not automatically declared equivalent by the deterministic resolver.

## BYOK / NVIDIA NIM assistance

Phase 2.3D reuses the existing authenticated BYOK system. No second API-key store is created.

The TechINT entity-resolution UI defaults the connection selector to **NVIDIA NIM**, while keeping the existing BYOK providers available.

Existing BYOK protections remain in force:

- the API key is accepted only by the existing BYOK connect flow;
- it is encrypted in the temporary HttpOnly cookie;
- the cookie is user-bound;
- the key is not stored in taxonomy tables, Technical Signals, audit rows, source cursors, or browser-visible application state;
- entity suggestion calls use the existing server-side `byokChat` provider client.

The suggestion endpoint is:

`POST /api/techint/entities/suggest`

It loads the authenticated user's unresolved groups server-side and sends only a bounded package containing:

- entity kind;
- observed/display label;
- conservative normalized lookup value;
- occurrence count;
- source-system names;
- semantic roles;
- at most a few signal titles;
- a bounded server-selected list of canonical candidates.

It does not send raw provider snapshots, full Technical Signal facts, credentials, source cursors, lease material, Investigation notes, Evidence, Reports, or profile data.

The model must return one of:

- `MATCH_EXISTING`
- `CREATE_NEW`
- `UNSURE`

with a confidence band and brief rationale.

For `MATCH_EXISTING`, the model may reference only a candidate UUID supplied by the server. A hallucinated or out-of-set candidate ID is downgraded to `UNSURE` before reaching the UI.

AI output is treated as untrusted model output and validated with strict Zod schemas. Source labels and signal titles are also explicitly treated as untrusted quoted content for prompt-injection resistance.

## AI cannot write canonical truth

The AI suggestion endpoint imports no canonical-entity mutation workflow and performs no taxonomy write.

An AI response never automatically:

- creates a canonical entity;
- creates an alias;
- links an assertion;
- changes a source assertion;
- creates an Investigation entity;
- creates a profile match;
- changes attribution;
- creates Global Priority or a ranking.

The analyst must separately confirm a group.

The grouped confirmation endpoint is:

`POST /api/techint/entities/resolve-group`

It re-loads the authenticated user's current unresolved exact group server-side and then uses the existing service-role-only trusted entity RPCs. It is bounded to at most 250 current assertions per request and is safe to retry.

For an AI or manual proposal the analyst can choose:

- **Confirm current group** — link current exact unresolved occurrences only;
- **Confirm & teach exact alias** — link current occurrences and explicitly save the exact value as an `ANALYST_CONFIRMED` alias so future exact assertions resolve automatically;
- **Create current group** — create a canonical entity and link the current exact group;
- **Create & teach alias** — create, link, and explicitly teach the exact alias.

AI never selects between these write actions on behalf of the analyst.

## Conservative normalization

For authoritative equality in the deterministic/alias resolver, ambiguous-name normalization remains intentionally narrow:

- trim surrounding whitespace;
- collapse repeated whitespace;
- case-fold for lookup.

It preserves punctuation, periods, hyphens, underscores, digits, and word boundaries.

The automatic resolver does **not** perform fuzzy matching, Levenshtein equality, phonetic equality, punctuation-stripping equality, stemming, token reordering, substring equality, transliteration guesses, or model-generated alias insertion.

Correctly unresolved is preferred to incorrectly canonicalized.

## Alias revocation

Revoking an alias:

- does not change the source assertion;
- does not change the canonical entity;
- does not rewrite audit history;
- does not disturb analyst-created or analyst-linked per-assertion decisions;
- returns alias-derived automatic resolutions that depended on that alias to `NEEDS_REVIEW`.

A later explicit analyst decision may resolve them again.

## Security / RLS / ACL

The four Phase 2.3D tables use owner-scoped RLS.

Authenticated users may SELECT only their own rows. Anonymous users receive no table access. Browser roles receive no direct INSERT/UPDATE/DELETE access and cannot execute trusted Phase 2.3D mutation RPCs.

Server actions and API routes derive the actor from `requireUser()`. Browser input never supplies a trusted owner ID.

Canonical mutation still occurs only through the server-only service-role trusted client. Database errors are converted into bounded application failures.

The BYOK suggestion route does not receive or import `SUPABASE_SERVICE_ROLE_KEY` and cannot mutate canonical state.

## UI hierarchy

Primary TechINT navigation remains exactly:

- Global View
- Profiles
- InvestINT

Entity resolution remains a secondary operations workspace at `/techint/entities`, peer in hierarchy to Technical Sources.

The revised workspace shows:

- resolved count;
- deterministic/known-safe work still pending;
- deduplicated analyst-review groups;
- dismissed count;
- automatic resolver action;
- optional BYOK provider connection, defaulting to NVIDIA NIM;
- bounded AI suggestions with explicit rationale/confidence;
- manual group resolution as fallback;
- canonical entity/alias management;
- normalization audit history.

The intended analyst experience is exception-driven: analysts review ambiguous identity questions rather than clean every source assertion individually.

## Explicit exclusions

Phase 2.3D does not implement:

- MITRE ATT&CK source ingestion or TAXII;
- URLhaus or another provider;
- authoritative external vendor/product taxonomy ingestion;
- autonomous AI resolution writes;
- AI-created aliases without analyst confirmation;
- embedding-vector storage or a separate vector database;
- profile matching;
- direct/contextual match scores;
- relevance scoring;
- Global Priority;
- Global View population/ranking;
- Standalone Profile matches;
- InvestINT matches;
- alerts/discovery;
- AI intelligence briefs;
- automatic analytical entity or Graph relationship creation;
- automatic promotion of project Threat Actor aliases or Malware family strings into the global taxonomy.

PR #30 remains separate and untouched.

## Phase 2.3E handoff

Phase 2.3E may consume:

`resolved Technical Signal entity assertions + canonical entities + Intel Profile definitions`

for matching and priority calculation. Phase 2.3D itself does not create match rows or scores.

## Migration / deployment procedure

Migration 037 remains the only Phase 2.3D migration. Migrations 001–036 remain unchanged.

The grouped review and BYOK suggestion extension adds no new database migration beyond 037.

Operator procedure after code review and explicit authorization:

1. apply migration 037 exactly once to the intended Preview/test Supabase;
2. reload PostgREST schema cache;
3. redeploy Preview;
4. run the acceptance checklist below.

The implementation agent must not apply migration 037 remotely without explicit operator permission.

## Preview acceptance checklist

1. Open `/techint/entities` after migration 037 and redeploy.
2. Verify repeated exact unresolved labels are grouped instead of rendered as one card per assertion.
3. Run the automatic resolver with a bounded batch.
4. Verify existing CVE assertions resolve deterministically.
5. Verify existing Indicator assertions resolve deterministically.
6. Verify ATT&CK IDs resolve deterministically when present.
7. Verify unresolved Malware/Vendor/Product strings remain grouped and do not auto-create canonical entities.
8. Verify previously confirmed exact aliases resolve automatically on a later reconciliation.
9. Connect an authenticated BYOK session using NVIDIA NIM.
10. Run **Analyze next unresolved groups**.
11. Verify only bounded group context and candidate names are sent; no API key or raw source snapshot appears in application records/log output.
12. Verify AI suggestions show decision, confidence and rationale but make no database mutation before confirmation.
13. Verify a hallucinated/non-candidate entity ID cannot be accepted by the response parser.
14. Confirm one `MATCH_EXISTING` suggestion without teaching an alias and verify only current exact unresolved occurrences are linked.
15. Verify future equal assertions do not learn from that link alone.
16. Confirm another group with **teach exact alias** and verify later exact assertions auto-resolve through the confirmed alias.
17. Confirm a `CREATE_NEW` suggestion and verify a canonical entity is created only after the explicit analyst action.
18. Revoke a learned alias and verify alias-derived automatic resolutions return to review while direct analyst links remain intact.
19. Verify original source assertions are unchanged.
20. Verify no Investigation analytical records, profile matches, Global Priority, Global View ranking, attribution, or Graph rows are created.
21. Verify second-user isolation for entities, groups, suggestions and confirmations.
22. Verify audit history records canonical/alias/resolution writes but never the BYOK API key.
23. Verify the automatic resolver itself performs no provider/network request.
24. Verify the BYOK suggestion feature fails safely when disconnected, expired, rate-limited, or malformed.
