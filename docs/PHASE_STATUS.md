# Phase Status

## Phase 1

- [x] Next.js App Router foundation preserved and extended.
- [x] Supabase SSR clients, authentication pages, protected routes, and sign-out implemented.
- [x] Versioned Supabase migration authored for profiles, projects, triggers, indexes, and RLS policies.
- [x] Dashboard reads real project data for the authenticated user.
- [x] Project create, read, update, delete, search, filtering, and sorting implemented with server actions and Zod validation.
- [x] Unit tests added for validation and authorization-related helpers.
- [x] Phase 1 SQL migration applied in Supabase, manually verified by the repository owner on the live deployment at https://cip-omega.vercel.app.
- [x] Real account registration, sign-in, and sign-out manually verified by the repository owner on the live deployment.
- [x] Project create, read, edit, delete, persistence after refresh/re-sign-in, and real dashboard counts manually verified by the repository owner on the live deployment.
- [x] Cross-user project isolation manually verified by the repository owner: a second user cannot see or directly access the first user's project.
- [x] Production Vercel deployment manually verified by the repository owner.

## Phase 2

- [x] Versioned migration authored for research notes, evidence metadata, timeline events, project tasks, private `evidence` Storage bucket restrictions, indexes, triggers, and RLS policies.
- [x] Project detail workspace implemented with Overview, Research Notes, Evidence, Timeline, and Tasks tabs backed by authenticated server mutations.
- [x] Direct signed evidence upload flow implemented without service-role keys, with metadata finalization, orphan cleanup on finalization failure, file replacement safety, and private signed download URLs.
- [x] Edit UI implemented for Research Notes, Evidence, Timeline Events, and Tasks.
- [ ] Phase 2 migration applied to live Supabase database (blocked unless `SUPABASE_DB_URL` is configured in the execution environment).
- [ ] Browser acceptance against live Supabase for Phase 2 workspace modules.

## Phase 3

- [x] Additive migration authored for CTI entities, relationship tables, constraints, indexes, updated_at triggers, authenticated-scoped RLS policies, and atomic relationship replacement RPC.
- [x] Project CTI tabs and detail routes implemented for Threat Actors, Campaigns, Indicators, Malware, CVEs, and MITRE Mapping with authenticated create, list, detail, edit, delete, search/filter/sort, validation, and searchable relationship controls.
- [x] CTI relationship model documented in README.md and docs/RELATIONSHIPS.md.
- [ ] Phase 3 migration applied to live Supabase database (blocked unless `SUPABASE_DB_URL` is configured in the execution environment).
- [ ] Browser acceptance against live Supabase for Phase 3 CTI modules.

## Phase 4

- [x] Additive migration authored for `public.entity_relationships`, database endpoint validation, RLS, duplicate/self-link constraints, indexes, updated_at trigger, and polymorphic cleanup triggers.
- [x] Protected graph endpoint returns typed nodes, semantic edges from all ten Phase 3 join tables, manual edges, deterministic global limits, dangling-edge prevention, and truncation metadata.
- [x] Project Knowledge Graph tab implemented with accessible legend, filters, search, deterministic/resettable layout, controlled node dragging, detail drawer, manual link creation, and manual edge edit/delete.
- [ ] Phase 4 migration applied to live Supabase database (blocked unless `SUPABASE_DB_URL` is configured in the execution environment).
- [ ] Browser acceptance against live Supabase for Knowledge Graph flows.

## Phase 5

- [x] Additive reports migrations authored for report schema, RLS, safe author assignment, REPORT graph enum support, graph validation, and delete cleanup.
- [x] Reports tab and edit route implemented with authenticated persistent CRUD, filters, dirty-state warning, and delete confirmation.
- [x] TipTap editor implemented with supported rich-text controls, strict versioned JSON validation, dirty-state protection, and structured JSON persistence.
- [x] Insert Project Data panel implemented for current-project workspace and CTI records.
- [x] Authenticated PDF, Markdown, and standalone HTML export routes implemented with safe filenames, structured TipTap rendering, controlled errors, and generated content.
- [x] Knowledge Graph extended with Report nodes, styles, detail links, manual relationships, and saved position validation.
- [ ] Phase 5 migrations applied to live Supabase database (blocked unless `SUPABASE_DB_URL` is configured in the execution environment).
- [ ] Browser acceptance against live Supabase for report editor/export flows.

## Phase 6 — Local Ollama AI Workspace
- Code added for server-only Ollama configuration/status, JSON validation, metadata usage limiting migration 012, project AI Workspace UI, generation routes, and explicit approval routes.
- Operator-reported prior live acceptance for Phases 1-5 is recorded separately from checks run in this environment.
- Migration 012 was authored but not applied in this container because no live Supabase connection was configured.
- Follow-up audit repaired MITRE approval to accept ATT&CK technique IDs, resolve them server-side to project-owned `mitre_techniques.id` values, and report linked/already-linked/rejected suggestions without trusting client UUIDs.
- Added executable Phase 6 regression tests for MITRE ID resolution, generation no-mutation/source whitelisting, six approval payloads, and client-side AI secret exposure checks.
- Live acceptance repair added migration 013 for AI usage-rate hardening after migration 012 was applied; migration 013 was authored but not applied in this Codex environment.
- Repaired live defects for indicator approval payloads/bulk approval, MITRE `technique_name` projections, report source projections, canonical translation approval source checks, and misleading cancel control copy.
- Live acceptance repair canonicalized Generate Report Draft source loading, hardened empty report draft validation, and blocked report generation/approval when no usable source or valid draft exists.

## Phase 7 — Public Demo and BYOK Cloud AI
- [x] Public synthetic `/demo` and `/demo/ai` routes added with clear no-persistence boundaries.
- [x] Fixed server-only BYOK provider registry added for OpenAI, OpenRouter, and Groq, while preserving local Ollama as a separate explicit provider.
- [x] AES-256-GCM temporary HttpOnly BYOK credential cookie implemented with user/guest binding and expiry.
- [x] Metadata-only guest session and usage migration 014 authored; not applied in this Codex environment because no live Supabase connection is configured.
- [x] Guest AI flow added with Turnstile-gated session creation, fixed pasted-text workflows, and no project persistence.
- [x] Authenticated AI workspace now exposes explicit Ollama vs connected BYOK selection without silent fallback.
- [x] Phase 7 PR repair added a shared accessible BYOK connection panel used by both guest demo AI and authenticated Project AI Workspace users.
- [x] Phase 7 PR repair moved the encrypted BYOK cookie to `Path=/api`, clears the legacy `/api/ai` path, and added safe generation error messages for missing/expired/mis-bound BYOK credentials.
- [x] Phase 7 PR repair added conservative defanged IOC normalization for Extract Indicators, preserving observed `[.]`/`hxxp(s)` values while using validated canonical values for duplicate checks and explicit approval.
- [x] Phase 7 PR repair replaced the `/demo/ai` hard-coded Turnstile bypass with the real Cloudflare widget and server-side siteverify flow.
- [x] Migration 015 authored to add `nvidia_nim` to the strict guest BYOK usage provider constraint without editing migration 014.

## CİTEM Product Roadmap Phase 2.1A — Investigation Foundation and IOC Workbench

- [x] Existing `projects` table and `/projects` routes preserved as the internal storage and routing model.
- [x] User-facing Project registry, create flow, dashboard metrics, and navigation changed to Investigation terminology.
- [x] Additive migration 016 authored for Investigation status/metadata, Indicator status/rationale/relevance, and project-owned Indicator observations.
- [x] Existing Project rows remain compatible through nullable metadata and default `DRAFT` status.
- [x] Project validation distinguishes new-Investigation research-question requirements from legacy edit compatibility.
- [x] Investigation list filters added for status, assessment confidence, open/closed state, type, priority, search, and sorting.
- [x] Investigation Overview now displays metadata, lifecycle dates, ownership label, and real counts from existing workspace tables.
- [x] Existing `tab=indicators` route retained and presented as IOC Workbench.
- [x] Shared pure IOC module added for type detection, conservative refanging, canonical normalization, validation, defanged display, hash identification, and bounded bulk parsing.
- [x] Existing AI extracted-Indicator validation refactored to reuse the same shared IOC functions without weakening prompt-injection boundaries.
- [x] Two-step bulk IOC preview/import added with mixed input, per-line classification, database duplicate checks, partial success, and accurate result counts.
- [x] CVEs remain in the CVE module; FILE and REGISTRY remain available through the existing manual Indicator form.
- [x] Indicator observations preserve exact accepted observed forms, observation/ingestion times, origin, source label, note, confidence, and creator.
- [x] Composite same-project foreign key, cascade cleanup, RLS, created-by checks, and security-invoker transactional import RPC added.
- [x] Existing Indicator create/edit/delete and CTI relationship controls preserved and extended with status, rationale, and current relevance.
- [x] Existing Indicator detail route extended with canonical/safe display summary and observation history.
- [x] Unit/static migration and workflow tests authored for Investigation validation, IOC detection/normalization/bulk parsing, RLS boundaries, AI normalizer reuse, and scope control.
- [x] Migration 016 applied. Manually verified by the repository owner against the configured Supabase/Vercel environment.
- [x] Investigation creation, IOC preview/import, five Indicator/five observation persistence, duplicate/invalid/CVE skips, refresh/re-authentication persistence, and regression checks manually verified by the repository owner against the configured Supabase/Vercel environment.
- [x] Cross-user isolation for the Investigation, Indicators, and observations manually verified by the repository owner against two configured test users.

### Explicitly deferred from Phase 2.1A

Structured Sources, enrichment providers, infrastructure clusters, enhanced Graph provenance, Timeline redesign, Attribution Analysis, specialised report types, immutable report versions, feeds, alerts, SIEM/SOAR integrations, and strategic analysis remained out of scope and were not started in Phase 2.1A.

## CİTEM Product Roadmap Phase 2.1B — Source Registry, Provenance and Enrichment Foundation

**Hardening status (migration 018):** enrichment results are append-only; run
identity, terminal history, deletion, and state transitions are database-enforced.
Source routes return controlled not-found responses for malformed, missing,
mismatched, and foreign records. Bounded stale runs fail with `STALE_RUN` before a
replacement starts, preserving prior history. Complete same-owner direct-write
prevention still requires a stronger trusted-server boundary and is not claimed.

- [x] Additive migration 017 authored for Source enums, `sources`, observation Source links, enrichment runs/results, same-project constraints, archive-safe Source behaviour, active-run uniqueness, RLS, identity protection, indexes and triggers.
- [x] Sources remain distinct from Evidence, Indicator observations, enrichment results and AI `ReportSourceRef` aliases.
- [x] Evidence/Sources research-artefact navigation and persistent Source Registry create/search/filter/edit/archive/restore/safe-delete workflow added.
- [x] Referenced Sources are protected from hard deletion; unreferenced Sources may be deleted and archived Sources remain historically visible.
- [x] Observation Source link/replace/remove and verification-state actions added while retaining legacy `source_label` fallback.
- [x] Server-only provider-neutral enrichment contracts, registry, safe errors and execution service added without AI BYOK or service-role reuse.
- [x] Disabled-by-default `fixture_cti` deterministic test provider added with no network requests and visible TEST / SYNTHETIC warnings.
- [x] Versioned normalized result validation, response hashing, bounded sanitized-raw policy, provider Source creation/reuse, run history and failure preservation added.
- [x] Existing Indicator URL extended with Summary, Observations, Enrichment, Sources, Relationships and Assessment sections.
- [x] Provider verdicts remain external context and do not automatically mutate Indicator status, confidence, rationale, relevance, Graph or Timeline.
- [x] Source/enrichment validation, migration/RLS, fixture provider, safe-error and scope-regression tests added.
- [ ] Migration 017 applied to the configured Supabase environment.
- [ ] PostgREST schema cache reloaded and migration-history state manually verified.
- [ ] Live Source Registry, observation provenance, fixture enrichment history/failure and two-user IDOR acceptance completed.
- [ ] Live regression acceptance for IOC Workbench, Evidence, Graph, Reports/exports, AI Workspace and BYOK completed.

### Explicitly deferred from Phase 2.1B

Infrastructure Clusters, Graph Source nodes/edge provenance, Timeline redesign, automatic Timeline events, Attribution Analysis, specialised reports, immutable report versions, feeds, watchlists, alerts, scheduled/background enrichment, SIEM/SOAR integration, active scanning, user-stored enrichment keys, world maps, ANLAK integration, strategic analysis and Phase 2.1C–E remain out of scope.

## CİTEM Product Roadmap Phase 2.1C — Infrastructure Analysis

- [x] Migration 019 authored with three same-Investigation tables, composite foreign keys, constraints, indexes, triggers, historical preservation, and owner-scoped RLS.
- [x] Infrastructure tab and owned cluster detail workflow added for persistent cluster, membership, assessment, archive/restore, and provenance actions.
- [x] Graph derives cluster nodes and membership edges from authoritative records, with an explicit historical relationship toggle.
- [x] Analyst-controlled boundaries documented; no automatic clustering, attribution, Timeline/report mutation, or Phase 2.1D work added.
- [ ] Migration 019 applied and PostgREST schema reloaded in live Supabase.
- [ ] Live two-user IDOR and workflow acceptance completed.
- [x] Phase 2.1C hardening validated migrations 001–019 in one PostgreSQL 16 transaction, removed same-transaction direct enum comparisons, preserved analytical status across archive/restore, and added executable action/route/Graph coverage.
# Phase 2.1D — implemented

Attack Timeline and Campaign Reconstruction is implemented through additive migration 020, owned event detail and Campaign reconstruction experiences, analyst-controlled memberships and provenance, and Campaign-to-Infrastructure Graph edges. Live Supabase migration and acceptance remain operator steps documented in `docs/PHASE_2_1D.md`.

## Phase 2.1E — Attribution and Competing Assessments

Implemented in migration 021 and Campaign-owned attribution routes: competing hypotheses, shared evidence, diagnostic evaluations, comparison matrix, explicit current judgement, actor backlinks, RLS, composite ownership integrity, and archive-safe history. Live Supabase application remains an owner acceptance step. See `docs/PHASE_2_1E.md`.

## Phase 2.1F — Intelligence Products and Versioned Assessments
- [x] Migration 022 defines product/lifecycle enums, immutable sequential Report versions, typed reference snapshots, publication authority, deletion guards, owner RLS, and same-Investigation integrity.
- [x] Existing Report workspace is retained and extended with explicit metadata, version creation/publication, read-only history, change-awareness doctrine, and version exports.
- [x] PostgreSQL 16 disposable smoke script, executable schema tests, security/AI boundaries, and live checklist are documented.
- [ ] Migration 022 and PostgREST reload completed in live Supabase.
- [ ] Two-user and full live acceptance checklist completed.

## Phase 2.2A — Research Sources and Secure Feed Ingestion
Implemented on migration 023: Investigation-scoped feed lifecycle UI, explicit server-only fetches, DNS-pinned SSRF/redirect controls, bounded RSS/Atom parsing, canonical normalized items, URL/content fingerprints, cross-feed observations, atomic leases/finalization, safe health/errors, and complete owner-scoped RLS. Live Supabase acceptance remains required; Research Inbox and scheduling are excluded. See `docs/PHASE_2_2A.md`.


## Phase 2.2B
Implementation adds the owner-scoped global OSINT feed, scheduled collection boundary, triage, and explicit Investigation linking. See [Phase 2.2B](PHASE_2_2B.md). Phase 2.2A live acceptance was owner-confirmed before PR #24 merged.


## Phase 2.2B.1
Secure JSON Feed 1.1 (with version 1 compatibility) extends the existing global and Investigation-scoped feed workflows through migration 026. Phase 2.2B live acceptance was authoritatively confirmed by the project owner before this phase began. See [Phase 2.2B.1](PHASE_2_2B1.md).

## Phase 2.2C — implemented
Provider-independent IOC adapter contracts, owner-local canonical candidates and provenance, exact leases/cursors, IOC Inbox triage, explicit Indicator/CVE acceptance, CIDR support, and an environment-gated deterministic synthetic adapter are implemented. Real provider integrations remain future work.

## Phase 2.2C.1 — ThreatFox IOC Connector
Implemented: fixed read-only ThreatFox Community API synchronization, encrypted owner credentials, bounded lookback, provenance, scheduler support, and analyst-controlled acceptance. Migration: `202607310028_phase2_2c1_threatfox_connector.sql`.

## Phase 2.2C.2 — Manual incremental synchronization implemented
Manual ThreatFox synchronization uses the provider-independent incremental contract, cursor v2/legacy upgrade, strict delta diagnostics, and atomic completion without migration 029. Automatic scheduling and automatic Inbox refresh are deferred until an operator-controlled deployment is available. URLhaus and OTX remain future work.

## Phase 2.3A — TechINT Shell and Intel Profile Foundation

- [x] TechINT top-level navigation shell added with Global View, Profiles, and InvestINT.
- [x] Additive migration 031 authored for owner-scoped Intel Profiles, profile items, audit events, RLS, constraints, and append-only audit access.
- [x] Standalone and Investigation-linked profile UI/actions added with explicit separation.
- [x] Investigation Intel Profile workspace route added with deterministic local refresh from existing Investigation CTI records.
- [ ] Technical signal collection, provider ingestion, matching, prioritization, alerts, Global View intelligence, and AI briefs remain intentionally out of scope for later phases.
- [x] PR #32 repair tightened TechINT mutations behind service-role trusted RPCs, made audit writes transactional, preserved excluded/removed item identities across refresh, and replaced the static migration check with a PostgreSQL execution harness.
- [x] Final PR #32 hardening enforces strict TechINT profile status transitions and database-authoritative Indicator validation/normalization with URL path/query case preservation.
- [x] Compatibility repair skips unsupported `FILE`/`REGISTRY` and malformed legacy Investigation Indicators during TechINT seeding without aborting profile creation or refresh.

## Phase 2.3B — Canonical Technical Signal Backbone

- [x] Provider-independent canonical signal schema authored in additive migration 032.
- [x] Immutable, idempotent source observations and current/supporting/stale/conflicting classification implemented.
- [x] Immutable canonical revisions and deterministic change-history foundation implemented.
- [x] Source-backed entity assertion foundation implemented without canonical entity resolution.
- [x] Service-role-only transactional trusted recording RPC and narrow server-only client implemented.
- [ ] Source adapters/collection, Global View population, profile matching, priority scoring, alerts, AI briefs, and discovery remain later-phase work.
- [ ] Migration 032 live application and operator-authorized acceptance remain pending.

## Phase 2.3C — Technical Source Pack and Collection Operations

### Foundation (merged PR #35)
- [x] Additive migration 033 authored for owner-scoped Technical Source connections, collection runs, bounded issues, audit events, exact leases, provider-bound cursors, RLS, ACLs, and controlled lifecycle RPCs.
- [x] Additive migration 034 repairs the Phase 2.3B advisory/report canonical-key validator without editing migration 032 and preserves the helper ACL boundary.
- [x] Initial fixed server-owned source registry delivered `TEST_SYNTHETIC`, `CISA_KEV`, and `NVD_CVE`.
- [x] Deterministic environment-gated synthetic collection travels through the real orchestrator and Phase 2.3B trusted Technical Signal recorder.
- [x] Fixed-host, bounded CISA KEV and NVD CVE adapters added with conservative source-backed mappings, incremental cursors, retry-safe replay, and no analytical entity creation.
- [x] Strict code-owned RSS, Atom, and JSON Feed parser foundation added without registering an unverified advisory endpoint or allowing user-supplied TechINT URLs.
- [x] Manual synchronization, bounded scheduler integration, sanitized run history, lifecycle controls, source settings, and secondary `/techint/sources` operations UI added while preserving the three-item TechINT primary navigation.
- [x] Live CISA KEV smoke test succeeded with 1,661 initial mapped/created signals and a later zero-change successful run.
- [x] Live NVD acceptance succeeded after bounded rate-limit/body-size/timeout repairs; the final policy keeps the 8 MiB response bound, 250-record pages with 125-record fallback, 6.5-second request pacing, and a source-specific 30-second timeout.

### Source-pack completion (merged PR #37)
- [x] Technical Source metadata generalized to use the full Technical Signal source-family vocabulary and source-owned setting descriptors.
- [x] Additive migration 036 authored for the source keys actually implemented by the completion: `FIRST_EPSS`, `THREATFOX`, and `MALWAREBAZAAR`, plus strict source settings/cursor validation. Migrations 033–035 remain unchanged.
- [x] FIRST EPSS adapter added using the fixed public FIRST API with bounded threshold/response/cursor semantics. EPSS and percentile remain provider scoring facts; they are not CİTEM confidence, severity, CVSS, business risk, or Global Priority.
- [x] EPSS is modeled as source-defined `PROVIDER_ALERT` (`report:first-epss:<CVE>`) with a CVE assertion so provider-specific EPSS facts do not collide with NVD's canonical `VULNERABILITY_CHANGE` projection for the same CVE.
- [x] ThreatFox → TechINT bridge added by reusing the existing encrypted owner credential and hardened ThreatFox provider client/mapping; no second credential store, IOC Inbox triage mutation, or automatic Indicator creation is introduced.
- [x] ThreatFox IOC canonical facts remain provider-independent while port, malware family, provider confidence, tags, timestamps, and metadata remain immutable source context/assertions.
- [x] MalwareBazaar metadata-only adapter added with a server-only `MALWAREBAZAAR_AUTH_KEY`, hard-coded `get_recent` POST query, bounded JSON response, and no sample-download/file-execution path.
- [x] `/techint/sources` settings rendering refactored toward registry metadata instead of accumulating source-name-specific UI branches; credential requirements are displayed without credential values.
- [x] Focused tests added for EPSS scoring semantics, ThreatFox credential reuse/canonical IOC mapping, MalwareBazaar Auth-Key isolation/metadata-only behavior, trusted-recorder persistence, and absence of direct analytical-table mutations.
- [x] PostgreSQL 16 source-pack harness added for migration 036 enum/settings/cursor contracts, success/failure cursor semantics, direct-mutation denial, sensitive-column denial, and owner isolation; CI workflow includes the new harness without removing existing validation.
- [x] GitHub Actions and Vercel Preview validation completed on the final PR #37 head before merge.
- [x] Operator live acceptance confirmed FIRST EPSS initial collection and idempotent replay, ThreatFox initial collection, and MalwareBazaar metadata collection plus replay behavior.
- [ ] ThreatFox transient/replay error classification remains a non-blocking follow-up; the initial live collection succeeded and no source data integrity failure was established.
- [ ] Final two-user browser isolation and no-analytical-side-effect live checks completed for the new source pack.

### Intentionally deferred from Phase 2.3C completion
- [ ] URLhaus remains unregistered: current verified Community API material requires Auth-Key and documented exports expose credential-bearing URLs; CİTEM will not weaken secret-handling or invent an unverified bulk-query contract.
- [ ] MITRE ATT&CK STIX/TAXII remains unregistered until a bounded initial-baseline plus incremental contract is implemented without raising global body limits or exceeding the 2,500-signal run ceiling.
- [ ] Additional vendor advisory feeds remain unregistered unless an official, stable, machine-readable, fixed-host/path feed with stable record identity is verified; no HTML scraping or guessed endpoint is allowed.
- [ ] Analyst-owned CİTEM CVE records are not reverse-ingested as external Technical Signals; Phase 2.3E may match external CVE assertions to existing owned CVE analytical entities.

## Phase 2.3D — Taxonomy, Alias and Canonical Entity Normalization

- [x] Additive migration 037 authored for owner-global `technical_entities`, confirmed aliases, current assertion resolutions, bounded append-only audit history, indexes, owner-scoped RLS, and service-role-only mutation RPCs.
- [x] Immutable Phase 2.3B source assertions remain untouched; normalization decisions are stored only in the new Phase 2.3D tables.
- [x] Deterministic CVE, ATT&CK technique/sub-technique, and Indicator identities reuse existing Phase 2.3B/CİTEM canonical rules and are owner-idempotent.
- [x] Ambiguous Threat Actor, Malware, Campaign, Vendor, Product, Sector, Country, Region, Infrastructure, and Tag names are not auto-created from source strings.
- [x] Conservative alias lookup folds only case and whitespace while preserving punctuation, digits, hyphens, underscores, and word boundaries; no fuzzy matching, stemming, substring matching, transliteration guessing, or AI inference is introduced.
- [x] Analyst workflows distinguish per-assertion links from reusable `ANALYST_CONFIRMED` aliases; remembering an alias is explicit and defaults off.
- [x] `AUTHORITATIVE_SOURCE` alias basis is modeled for future verified taxonomy ingestion but cannot be forged through the normal analyst/browser workflow; no MITRE alias catalog or ATT&CK ingestion is added here.
- [x] Alias revocation returns dependent automatic alias resolutions to `NEEDS_REVIEW` while preserving analyst-linked/created decisions and immutable source assertions.
- [x] Bounded, deterministic, retry-safe reconciliation is separate from `record_technical_signal` and performs no provider/network or AI call, keeping source collection and normalization as separate failure domains.
- [x] Secondary `/techint/entities` workspace added without changing the locked primary TechINT navigation of Global View, Profiles, and InvestINT.
- [x] Project-scoped Threat Actor aliases, Malware family strings, and other Investigation analytical values are not automatically globalized into the TechINT taxonomy.
- [x] Focused normalization/boundary tests and a PostgreSQL 16 Phase 2.3D migration harness are included; CI is extended without removing prior harnesses.
- [ ] Migration 037 applied to Preview/test Supabase and PostgREST schema reloaded — operator step requiring explicit authorization.
- [ ] Preview/browser acceptance checklist completed, including deterministic resolution, explicit alias teaching/revocation, source-assertion immutability, and second-user isolation.
- [ ] Phase 2.3E profile matching, relevance scoring, Global Priority, Global View population, alerts/discovery, and AI briefs remain intentionally unimplemented.
