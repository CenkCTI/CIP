# Phase 2.3D — Taxonomy, Alias and Canonical Entity Normalization

## Purpose

Phase 2.3D introduces an owner-scoped canonical TechINT entity layer above immutable Phase 2.3B source-backed entity assertions. It answers a narrow question: when multiple source observations refer to an entity, which references can be resolved safely to the same canonical identity?

This phase does not perform profile matching, relevance scoring, Global Priority, Global View ranking, Investigation mutation, attribution, alerts, or AI analysis.

## Trust boundary

The data flow is deliberately separated:

`external source → Technical Signal → immutable observation → immutable entity assertion → Phase 2.3D resolution`

A source assertion remains source truth. Phase 2.3D never rewrites `technical_signal_entity_assertions.display_value`, `normalized_value`, `assertion_basis`, source provenance, or observation identity.

The three layers remain distinct:

1. **SOURCE ASSERTION** — immutable source-backed or system-extracted context attached to an exact Technical Signal observation.
2. **CANONICAL ENTITY** — owner-global TechINT identity used by later matching and prioritization.
3. **ANALYTICAL ENTITY** — Investigation-scoped Threat Actor, Malware, Campaign, CVE, Indicator, MITRE, or Infrastructure records controlled by an analyst.

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

An analyst can link one assertion to an entity without teaching a reusable alias. Remembering an alias is a separate explicit action and defaults off.

### `technical_entity_audit_events`

Append-only bounded audit history records canonical entity lifecycle, alias confirmation/revocation, automatic resolution, analyst resolution, dismissal, and reset-to-review events. Raw provider payloads, credentials, cursors, lease material, and unbounded source data are not stored in the audit table.

## Conservative normalization

For ambiguous names Phase 2.3D lookup normalization is intentionally narrow:

- trim surrounding whitespace;
- collapse repeated whitespace;
- case-fold for lookup.

It preserves punctuation, periods, hyphens, underscores, digits, and word boundaries.

The phase does **not** perform fuzzy matching, Levenshtein distance, phonetic matching, punctuation stripping, stemming, token reordering, substring matching, transliteration guesses, alias generation, or AI inference.

Therefore these are not automatically equal:

- `Lumma Stealer` / `Lumma-Stealer` / `LummaStealr`
- `APT 28` / `APT28`
- `Black Basta` / `BlackBasta`

Correctly unresolved is preferred to incorrectly canonicalized.

## Bounded reconciliation

`reconcile_technical_entity_assertions(actor, limit)` is a server-only, service-role-only, non-provider workflow with a 1–500 assertion bound.

It processes assertions deterministically by creation time and ID.

### Deterministic assertions

Valid CVE, ATT&CK technique/sub-technique, and Indicator assertions reuse the existing canonical helpers and are resolved to owner-scoped deterministic entities. Exact retries reuse the same deterministic entity.

### Ambiguous assertions

For non-deterministic kinds the workflow performs only exact lookup against ACTIVE confirmed aliases. If exactly one valid alias exists, the assertion resolves through that alias. Otherwise it remains `NEEDS_REVIEW`.

An ambiguous source string alone never creates a canonical entity.

Dismissed assertions remain dismissed during normal reconciliation.

## Failure isolation

Reconciliation is intentionally not called by `record_technical_signal` and no database trigger connects source recording to taxonomy mutation. Source collection and canonical normalization therefore remain separate failure domains: a taxonomy bug cannot roll back Technical Signal ingestion.

The reconciliation path performs no external provider/network request and no AI call.

## Alias revocation

Revoking an alias:

- does not change the source assertion;
- does not change the canonical entity;
- does not rewrite audit history;
- does not disturb analyst-created or analyst-linked per-assertion decisions;
- returns alias-derived automatic resolutions that depended on that alias to `NEEDS_REVIEW`.

A later explicit analyst decision may resolve them again.

## Analyst workflows

The secondary `/techint/entities` workspace supports:

- bounded safe reconciliation;
- canonical entity creation;
- canonical entity creation from an unresolved assertion;
- linking an assertion to an existing entity;
- linking without saving a reusable alias;
- linking while explicitly remembering an analyst-confirmed alias;
- manual confirmed-alias creation;
- alias revocation;
- non-deterministic canonical entity rename;
- archive/restore;
- dismiss unresolved assertion;
- reset dismissed assertion to review.

Deterministic identity cannot be renamed into another CVE, ATT&CK technique, or Indicator. Correction requires resolving to the correct deterministic entity.

## Security / RLS / ACL

The four new tables use owner-scoped RLS.

Authenticated users may SELECT only their own rows. Anonymous users receive no access. Browser roles receive no direct INSERT/UPDATE/DELETE access and cannot execute trusted Phase 2.3D mutation RPCs.

Server actions derive the actor from `requireUser()` and call a server-only service-role client. Browser input never supplies a trusted owner ID.

Database errors are converted into bounded application failures; service-role keys, SQL text, stack traces, source cursors, lease tokens, provider bodies, and environment secrets are not returned to the browser.

## UI hierarchy

Primary TechINT navigation remains exactly:

- Global View
- Profiles
- InvestINT

Entity normalization is a secondary operations workspace at `/techint/entities`, peer in hierarchy to Technical Sources rather than a fourth primary TechINT tab.

The workspace labels SOURCE ASSERTION, CANONICAL ENTITY, ANALYST-CONFIRMED ALIAS, and authoritative alias semantics separately so canonical resolution is not presented as attribution certainty.

## Explicit exclusions

Phase 2.3D does not implement:

- MITRE ATT&CK source ingestion or TAXII;
- URLhaus or another provider;
- fuzzy/string-similarity proposals;
- AI alias suggestions;
- profile matching;
- direct/contextual match scores;
- relevance scoring;
- Global Priority;
- Global View population/ranking;
- Standalone Profile matches;
- InvestINT matches;
- alerts/discovery;
- AI briefs;
- automatic analytical entity or Graph relationship creation;
- automatic promotion of project Threat Actor aliases or Malware family strings into the global taxonomy.

PR #30 remains separate and untouched.

## Phase 2.3E handoff

Phase 2.3E may consume:

`resolved Technical Signal entity assertions + canonical entities + Intel Profile definitions`

for matching and priority calculation. Phase 2.3D itself does not create match rows or scores.

## Migration / deployment procedure

Migration 037 is additive. Migrations 001–036 must remain unchanged.

Operator procedure after code review and explicit authorization:

1. apply migration 037 exactly once to the intended Preview/test Supabase;
2. reload PostgREST schema cache;
3. redeploy Preview;
4. run the acceptance checklist below.

The implementation agent must not apply migration 037 remotely without explicit operator permission.

## Preview acceptance checklist

1. Open `/techint/entities` after migration 037 and redeploy.
2. Run bounded safe reconciliation.
3. Verify existing CVE assertions resolve deterministically.
4. Verify existing Indicator assertions resolve deterministically.
5. Verify ATT&CK IDs resolve deterministically when such assertions exist.
6. Verify MalwareBazaar/ThreatFox malware-name assertions do not become canonical Malware entities merely from string equality.
7. Choose one unresolved Malware assertion and create/select a canonical Malware entity.
8. Link it without remembering an alias.
9. Verify another equal source string does not resolve from that per-assertion link.
10. Explicitly confirm the source value as an alias.
11. Reconcile again and verify exact matching assertions resolve through the confirmed alias.
12. Revoke the alias and verify alias-derived automatic resolutions return to review.
13. Verify the analyst-linked assertion remains resolved.
14. Verify original source assertions are byte-for-byte unchanged in their canonical fields/provenance.
15. Verify no Investigation analytical records, profile matches, Global Priority, or Global View ranking rows were created.
16. Verify second-user isolation.
17. Verify audit history records analyst actions.
18. Verify reconciliation performs no provider/network request.
