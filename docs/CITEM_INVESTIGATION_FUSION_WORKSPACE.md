# CİTEM — Investigation Fusion Workspace

## Purpose and epistemic boundary

Fusion is an analyst-controlled workspace within one existing Investigation (`projects.id`). It consolidates source-material navigation, a unified canonical inventory, existing graph relationships, manually associated countries, country notes, and linked private Evidence files. It does **not** autonomously perform analysis, attribution, scoring, geopolitical inference, source corroboration, or LLM processing.

The three main views are `/projects/[id]/fusion?view=inventory|graph|map`. Legacy `view=countries` links redirect to the World Map and open the country popup. The original Source Reader, Source Claims, Notes, Evidence, graph storage, and their authorizations remain authoritative.

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

Migrations 069–074 were previously applied to the connected CIP Supabase database (migration names differ due to a pre-existing unrelated migration with suffix 069). **New migration 075 is on this feature branch only and has not been applied to any live Supabase project.** Run them on an isolated PostgreSQL/Supabase instance with the full existing migration history before production deployment. Review RLS grants, security-definer trigger behavior, the geographic reference data, and source/workspace regressions before merge. No new environment variable or additional Storage bucket is required. The suspended AI Copilot navigation is hidden by default and can be explicitly opted in using `NEXT_PUBLIC_CITEM_STAGE3_COPILOT_ENABLED=true`; existing Copilot backend is untouched.

## Validation matrix

- Unit: canonical uniqueness, multi-source group membership, unlinked records, deep link, country ISO dataset integrity.
- Database integration: GitHub Actions PostgreSQL 16 full-chain tests through 075, owner/cross-investigation denial, attachment integrity and invoker views. The CI logs are the evidence for current pass/fail state.
- Browser/manual (pending): source annotation navigation, graph CRUD/layout persistence, keyboard map selection/pan, 249-country search, notes CRUD, reusing Evidence private upload/download, country detaching without deletion.
- Commands to execute on a suitable checkout: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` (requires live test auth/config).

### Known limitations and deployment blockers

* GitHub CI provides npm lint/typecheck/tests/build and isolated PostgreSQL acceptance. Authenticated browser end-to-end acceptance remains required; a PR is not a production-ready release.
* Inventory groups only the 50 records on the active page; to examine another page, use server-side pagination. Source/gap/requirement filtering is by UUID rather than a label picker.
* Popup fetches 20 notes, links and attachments per page. Link Existing Evidence and Link Record search use server-side filtered pagination.
* Popup Upload & Attach to Country uses the existing signed private Evidence Storage pipeline and an existing canonical Evidence record ID. If the follow-on attachment fails, the UI explicitly reports the retained Evidence record for manual recovery.
* Map coverage depends on 110m geometry, which is too coarse for some islands/territories and not suitable for legal border judgments.
* No AI automation, global geopolitical scoring, or automatic source reliability estimates are added.

## Acceptance requirement

Do not call Fusion production-ready until lint, typecheck, tests, isolated migration validation, owner-RLS tests, and end-to-end acceptance are confirmed. The feature branch must not be merged or deployed solely because the UI renders.

## V2 — World Map / Country Intelligence Popup (PR #86 refactor)

**Three primary views**: Inventory, Relationship Graph, World Map. Country Notes & Attachments is no longer a primary tab. Its behavior is consolidated into a large, responsive, centered dialog with four tabs (Overview, Linked Records, Notes & Files, Cyber Activity), launched by selecting a country polygon or by searching all 249 ISO country/territory records.

**Navigation**: `view=map&country=PL` opens the popup. Legacy `view=countries&country=PL` and `countryId` links resolve to the World Map. Opening a country adds a browser-history entry; switching or closing updates the current entry. Popstate restores the popup country. Map zoom/pan and search filters are local state preserved while the dialog opens or closes.

**Data architecture**: `GET /api/projects/[id]/fusion/country` always checks `requireOwnedProject`. It fetches only the selected country and includes canonical source provenance. On-demand `mode=lookup` paginates candidate records for secure linking. `GET /api/projects/[id]/fusion/evidence` lists only owned Investigation Evidence for manual association. No collectors, news or AI are introduced.

**New additive migration 075**: `fusion_country_link_items`, `fusion_country_attachment_items`, and `fusion_country_link_type_counts` are `security_invoker=true` read views over the existing country links and canonical Inventory/Evidence. They enable full-dataset title search with server-side 20-row pagination, accurate type-group counts, and note-level attachment visibility independently of the note page. There is no new duplicate country table. The existing graph and manual edges remain authoritative.

**Operations**: The dialog reuses original country note CRUD, association insert/delete and private Evidence download/upload; adds typed relationship/rationale editing, analyst-authored Country Brief using a note titled `Country Brief`, notes metadata and explicit Cyber Activity lists. Brief is not an AI conclusion. Source upload finalization now returns the inserted Evidence ID so a successful private upload can be attached immediately; attachment failures are surfaced without deleting the canonical Evidence file. Save operations reload only the selected country's data.

**Time zones**: The header uses the browser's current clock and `Intl.DateTimeFormat` with explicitly curated IANA time zones and daylight-saving transitions. Several major multi-zone countries include a zone selector. This is an incomplete curated mapping, **not** a verified exhaustive capital/time-zone database; unlisted countries show unavailable instead of invented metadata.

**Known V2 limitations**: The V2 popup requires migration 075 in the target environment before country data routes can succeed; its unmerged version has *not* been deployed to production. The curated capital and time-zone mapping covers a subset of ISO catalog entries. The map's Natural Earth 110m polygons do not cover every territory. The country search is keyed to canonical titles, not arbitrary full-text body matches. Country Brief is represented by a reserved note title rather than a new brief field; concurrent brief creation needs product acceptance testing. Graph displays only entity kinds already supported in the canonical Graph (Timeline remains outside graph node types). Cyber Activity lists explicit associations with at most eight previews per section and links back to the canonical records; no sectors or geopolitical predictions are inferred. Real authenticated browser/storage acceptance is still a release gate.

**CI and acceptance**: Verify the exact PR HEAD and individual GitHub Actions logs. Full PostgreSQL chain plus RLS and cross-investigation tests are available in `scripts/test-fusion-workspace-migrations.sh`, while UI interaction tests are in `tests/fusion-country-popup.test.tsx`. Neither an unrun browser scenario nor a skipped gate is considered passed. No merge or production deployment is authorized by this document.


## V3 — Evidence Inventory Record Popup & Analyst Assignments (Migration 076)

Evidence Inventory rows open a centered, responsive record dialog instead of a right-hand drawer. An analyst can organize the selected record and remain within Inventory, including formerly unlinked records. The modal has **Assignments** and **Evidence & provenance** views. The optional "Original record" link is retained for in-depth source reading but is not needed for assignment operations.

**Analyst-controlled assignments:** add, edit rationale, and remove explicit Source / Information Gap / Collection Requirement associations across all eighteen Inventory record families; manage existing Country relationships (including relation meaning and rationale); add or unlink countries; and save Source review state when viewing a Source record. Canonical source associations, Source Claim assertion links and annotation provenance remain immutable from this dialog. Manual assignments are a separate knowledge layer, not evidence of corroboration or attack origin.

**Migration `202610270076_fusion_inventory_assignments.sql`** creates `fusion_record_assignments`, project-owner RLS, same-investigation validation triggers, deletion cleanup, a mutation-audit trigger, and adds `assigned_source_ids`, `assigned_gap_ids` and `assigned_requirement_ids` to the existing `fusion_inventory_items` invoker view (new columns appended, not replacing provenance columns). Country link types now include Information Gap and Collection Requirement using existing `investigation_country_links`. No second country model, new graph, or duplicated source content is introduced.

**Queries:** `/api/projects/[id]/fusion/inventory` requires project ownership for both record-detail reads and 20-item paginated candidate searches. Selection and writes are revalidated in authenticated server actions. Manual associations update existing Inventory grouping and filtering; the modal reloads its authorized record and revalidates the Inventory page after changes. Deleting a manual link never deletes the linked canonical record. User-facing action failures remain visible without a false success state.

**Verification:** `tests/fusion-inventory.test.ts` covers original/manual group separation; `tests/fusion-inventory-popup.test.tsx` exercises popup editing without navigation; `tests/fusion-postgres-acceptance.sql` probes manual-assignment cross-user/cross-investigation denial, persisted rationales, and invoker Inventory semantics. Existing CI runs the full migration chain including 076 on an isolated database.

**Deployment boundary:** Migration **076 is branch-only and is NOT applied to the connected CIP Supabase database**. Existing 069–075 remain deployed, but the Inventory edit feature depends on 076 and cannot be considered live until migration 076 is reviewed and applied in the intended nonproduction or approved database. Real signed-in browser testing remains a release gate. No production deploy, main merge, or Copilot reactivation is authorized.

## V3.1 — Embedded Source Highlighting / Process-Extract in Evidence Inventory

The Inventory record popup includes **Highlight · Process / Extract** alongside Assignments and Evidence / Provenance. It uses the original SourceReaderWorkspace, PdfSourceViewer, and AnnotationProcessingActions (the Stage 3 destination menu), rather than inventing a second processing engine. The existing server actions create real source annotations and linked Timeline Events, Source Claims, Indicators, Malware, CVE, ATT&CK, Campaign, Actor, and Attribution Claim outputs.

The new owner-checked GET endpoint /api/projects/[id]/fusion/processing resolves a canonical Source from the selected owned inventory record, or an existing Source evidence_id for an Evidence item. It checks ownership at both the inventory and source levels, loads the existing Stage 2/3 Source Reader data and signed private Source asset URL, and never accepts an arbitrary sourceId directly from the browser. Without a usable Source, the UI explains the blocker instead of creating synthetic annotations. Analyst-assigned Source links provide a processing context, but remain separate from verified canonical evidence provenance.

When embedded, the Source Reader hides its navigation back to Sources and the AI Copilot activation. The nested Stage 3 dialog is layered above the Fusion popup, and the outer focus/Escape handler yields to it. Successful processing actions refresh the selected source context and Inventory without navigating away.

Implementation: src/lib/fusion/source-reader-data.ts, src/app/api/projects/[id]/fusion/processing/route.ts, src/components/fusion/fusion-inventory-processing.tsx, reused Source Reader and Processing components. Test: tests/fusion-inventory-processing.test.tsx plus existing Source Reader and Fusion regressions.

**Remaining acceptance:** run a signed-in browser test of PDF text highlights, region annotations, Process/Extract, mark processed, Timeline/IOC creation, source-claim linking and provenance/audit readback. No production deployment, main merge or AI Copilot reactivation has been authorized.


## Cinematic World Atlas visual layer (stacked map-design PR)

The map retains the original same-Investigation hit-testing, Natural Earth 1:110m
country polygons, country search, zoom/pan, labels and Country Intelligence Popup.

Two **historical static, equirectangular** NASA datasets supply cinematic color:

- [NASA Blue Marble — Land, Ocean and Ice](https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.jpg):
  land/terrain appearance beneath the interaction layer.
- [NASA Black Marble 2016](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg):
  observed night-light texture composed above terrain. The retired NEO Black
  Marble URL was replaced with NASA's current Science asset endpoint.

The app fetches both via fixed, bounded, cached same-origin route handlers:
`/api/fusion/atlas-terrain` and `/api/fusion/atlas-texture`. The browser never
requests a third-party map service and no analyst/project context is transmitted
to NASA. A vector land silhouette remains as a fallback if either provider is
unavailable. Fractal cloud texture and gold boundaries are decorative; they do
**not** represent current cloud conditions, active incidents or any threat score.

This implementation recreates the reference's **visual language**, rather than
using a flattened, geographically unregistered concept-art screenshot as a map
tile. This protects the accuracy of polygon click targets at every zoom level.

Validation: `tests/fusion-cinematic-map.test.ts` checks raster composition,
the retained interactive country layer, and the fixed NASA proxy sources.
Live deployment/browser screenshot review and country-popup interaction remain
separate acceptance gates. This visual-only PR does not apply migrations,
alter saved evidence, or enable live collection.
