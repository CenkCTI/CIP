# CİTEM — Investigation Fusion Workspace

## Purpose and epistemic boundary

Fusion is an analyst-controlled workspace within one existing Investigation (`projects.id`). It consolidates source-material navigation, a unified canonical inventory, existing graph relationships, manually associated countries, country notes, and linked private Evidence files. It does **not** autonomously perform analysis, attribution, scoring, geopolitical inference, source corroboration, or LLM processing.

The four UI views are `/projects/[id]/fusion?view=inventory|graph|map|countries`, reachable from existing Investigation navigation. The original Source Reader, Source Claims, Notes, Evidence, graph storage, and their authorizations remain authoritative.

## Architecture and canonical material

`fusion_inventory_base` is an RLS-invoker union of 18 existing investigation record families: SOURCE, SOURCE_ASSET, SOURCE_NOTE, ANNOTATION, SOURCE_CLAIM, ATTRIBUTION_CLAIM, RESEARCH_NOTE, EVIDENCE, TIMELINE_EVENT, ACTOR, CAMPAIGN, INDICATOR, MALWARE, CVE, MITRE, COUNTRY_NOTE, INFORMATION_GAP, and COLLECTION_REQUIREMENT. It contains one row per canonical ID/type, not one row per reference. `fusion_inventory_items` inherits source IDs from direct source fields, source annotations, claim assertions, and annotation output mappings. Gap and requirement IDs are then looked up from previously recorded collection links. This is an **association graph**, not inferred corroboration.

Direct links: source attachment to source, source annotation to passage, source to Gap/Requirement, and explicit country link. Inherited links: Source Claim to one or multiple underlying source annotations; technical entities to annotations through source-annotation outputs. Every Source Claim remains **one record** irrespective of its number of source assertions. Some record families currently do not carry source provenance and remain in the "Independent / Unlinked" inventory group. Nothing is silently assigned a source ID.

Inventory uses ordered server-side pagination (50 per page, explicit project and type filters); grouping by source, gap, requirement, type, country, and flat is applied to the returned page. One record can appear in more than one group, but the unique matching count is returned separately from the database. The detail inspector opens the original source or canonical record. Evidence material stays in its original table and private storage path.

## Graph integration

The original `entity_relationships`, `graph_entity_type`, `graph_entity_exists`, Graph API, saved node coordinates, and `KnowledgeGraph` (`@xyflow/react`) continue to be used. Migration 071 extends those enumerations and endpoint validation to SOURCE, SOURCE_ASSET, SOURCE_NOTE, ANNOTATION, SOURCE_CLAIM, ATTRIBUTION_CLAIM, RESEARCH_NOTE, TIMELINE_EVENT, COUNTRY_NOTE, and COUNTRY. Existing graph node and edge limits remain in force; the UI already surfaces truncated graph metadata.

The Graph displays typed, explicitly analyst-created country links via `investigation_country_links` as manual edges. These links do not turn source-reported geographies into facts. Manual node-to-node edges continue to use existing `entity_relationships` mutations, validation, and persisted positions.

## Country catalog and map

`fusion_country_reference` seeds 249 ISO 3166 alpha-2 and alpha-3 country/territory entries from [lukes/ISO-3166-Countries-with-Regional-Codes](https://github.com/lukes/ISO-3166-Countries-with-Regional-Codes) with English labels and UN regional metadata. Polygon boundaries use a bundled, simplified Natural Earth Admin-0 1:110m geometry source, maintained at [nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector), which is public-domain geographical material. The dataset includes 174 features matching ISO alpha-3 codes. All 249 countries and territories remain searchable and selectable even where the 1:110m world geometry has no polygon or a boundary discrepancy. This is a visualization, not a legal assertion about sovereignty or maritime borders.

The SVG map supports keyboard country focus/Enter selection, dragging, zooming, search, selection, and actual project country association counts. Counts represent manually linked artifacts, notes, or attached evidence only; never threat level or attack counts. Search catalog remains authoritative for small islands and disputed territories.

## Country notes, relations, attachments

`investigation_countries` is a unique Investigation/country association; created on first note or link. Country notes are first-class records, with author and creation/update timestamps, editable title and text, and delete behavior. The explicit `investigation_country_links` target type and relation type are constrained by allowlists. A trigger validates that a linked target belongs to the same Investigation and is accessible to the current owner. Deleting a linked target removes only the association. The link does not modify or duplicate the original record.

`fusion_attachment_links` attaches an existing `evidence` item to a country or country note by composite project-aware foreign keys. It never relocates the private Storage object or generates an alternate upload permission model. The Country UI reuses the existing `EvidenceUpload` and `EvidenceDownload` components; a newly uploaded file is recorded as existing Evidence and must then be associated through the Attach control. Remove/Detach only removes the association. Source assets remain separate from general Evidence items.

### Source review state

`sources.review_status` is an explicitly managed review state with NOT_REVIEWED, IN_PROGRESS, NEEDS_REVIEW, REVIEWED. `reviewed_at` and `reviewed_by` are populated only when a source is explicitly marked REVIEWED. Annotation processing does not mark the source REVIEWED.

## Security and audit

All new mutable public tables have owner-scoped RLS `project_is_owned(project_id)`. `created_by` must match `auth.uid()` for inserts. Note and link UPDATE also enforce owner/creator identity. Database views use PostgreSQL 15+ `security_invoker=true` so each underlying table's RLS remains active. Polymorphic link insertion uses a security-invoker validation trigger and an application ownership check. Inventory only reads project-scoped records. Server actions parse input with Zod, re-check project ownership and target membership, and do not expose service-role keys.

`fusion_activity_events` retains lightweight append-only mutation metadata for country notes, country links, attachments, and existing graph manual edges (table, ID, type of mutation, actor, time). Note bodies, original file contents, and sensitive source text are **not copied** into audit rows. Legacy pre-Fusion changes are not reconstructed.

## Migration sequence

Apply in order **after** existing migrations up to 068:
1. `202610260069_fusion_country_foundations.sql` — ISO catalog, country association/notes/links/evidence linking and ownership validation.
2. `202610260070_fusion_inventory_views.sql` — invoker-security canonical inventory and provenance resolution.
3. `202610260071_fusion_graph_extensions.sql` — additive types and graph endpoint validation/cleanup.
4. `202610260072_fusion_country_counts.sql` — invoker-security country counts.
5. `202610260073_fusion_activity_audit.sql` — minimal audit trail.
6. `202610260074_source_manual_review_status.sql` — manual source status independent of annotations.

These migrations have been written for review **but have not been applied to any live database**. Run them on an isolated PostgreSQL/Supabase instance with the full existing migration history before production deployment. Review RLS grants, security-definer trigger behavior, the geographic reference data, and source/workspace regressions before merge. No new environment variable or additional Storage bucket is required. The suspended AI Copilot navigation is hidden by default and can be explicitly opted in using `NEXT_PUBLIC_CITEM_STAGE3_COPILOT_ENABLED=true`; existing Copilot backend is untouched.

## Validation matrix

- Unit: canonical uniqueness, multi-source group membership, unlinked records, deep link, country ISO dataset integrity.
- Database integration (pending): migrate on isolated Supabase, invoker-view select, cross-user/cross-investigation denial, invalid typed targets, composite FK enforcement, source review status transitions, deterministic pagination, cascade cleanup, and mutation audit.
- Browser/manual (pending): source annotation navigation, graph CRUD/layout persistence, keyboard map selection/pan, 249-country search, notes CRUD, reusing Evidence private upload/download, country detaching without deletion.
- Commands to execute on a suitable checkout: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` (requires live test auth/config).

### Known limitations and deployment blockers

* In this branch's authoring environment, the full repository/npm dependencies and an isolated Supabase test database were unavailable; **CI, database migration validation, and end-to-end validation must be completed**. A PR is a review artifact, not a production-ready release.
* Inventory groups only the 50 records on the active page; to examine another page, use server-side pagination. Source/gap/requirement filtering is by UUID rather than a label picker.
* Country workspace limits initial note/association/attachment listings to 100 rows and record/evidence pickers to 100 recently updated results; use Inventory to locate the record and its "Link to country" deep-link (if exposed). Pagination/load-more for very large country workspaces remains a follow-up.
* New file uploads use the existing Evidence library, then require a separate country-link action; no fake automatic association.
* Map coverage depends on 110m geometry, which is too coarse for some islands/territories and not suitable for legal border judgments.
* No AI automation, global geopolitical scoring, or automatic source reliability estimates are added.

## Acceptance requirement

Do not call Fusion production-ready until lint, typecheck, tests, isolated migration validation, owner-RLS tests, and end-to-end acceptance are confirmed. The feature branch must not be merged or deployed solely because the UI renders.
