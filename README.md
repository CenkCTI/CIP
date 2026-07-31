# CİTEM

CİTEM is BAYKUSH's dark-first cyber threat intelligence workspace, built with Next.js, Supabase, and TypeScript.

## Setup for non-developers

1. Install Node.js 20+ and npm.
2. Copy `.env.example` to `.env.local` and fill in the Supabase values from your Supabase project.
3. In Supabase Auth, set the Site URL to `http://localhost:3000` for local testing and add your Vercel URL before production.
4. Apply the database migrations in filename order.
5. Run `npm install`, then `npm run dev`, and open `http://localhost:3000`.

## Commands

- `npm run dev` starts local development.
- `npm run lint` checks code style.
- `npm run typecheck` runs strict TypeScript.
- `npm test` runs unit tests.
- `npm run build` creates a production build.
- `npm run test:e2e` runs Playwright tests when live Supabase credentials are available.

## Vercel

Set `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Vercel. Do not add service-role keys to frontend environments.

## Mutation pattern

Project create, update, and delete use Next.js Server Actions with Zod validation in `src/app/actions.ts`; reads are server-rendered with Supabase RLS enforcing ownership.

## Phase 2 Storage setup

Apply migrations in order, then verify that Supabase Storage contains a private bucket named `evidence`:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/202607210001_phase1_foundation.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/202607210002_phase2_workspace.sql
```

The Phase 2 migration configures the bucket as private with a 20 MB limit and MIME restrictions for PNG, JPEG, PDF, PCAP, LOG, and TXT evidence. Object paths are scoped as `{userId}/{projectId}/{uuid}-{sanitizedFileName}` and Storage RLS only allows authenticated project owners to read, upload, or delete their own project evidence objects.

## Phase 3 CTI relationship model

CİTEM models CTI with project-owned Threat Actors, Campaigns, Indicators, Malware, CVEs, and MITRE Techniques. Semantic relationships are represented by explicit join tables rather than polymorphic links. Each join table includes `project_id`, the two entity IDs, `created_at`, a duplicate-safe unique pair constraint, and composite foreign keys back to `(project_id, id)` on both sides. This guarantees that relationships cannot connect records from different projects, while cascade delete removes orphaned relationship rows when an entity or project is deleted.

The Phase 3 UI adds project tabs for Actors, Campaigns, Indicators, Malware, CVEs, and MITRE Mapping. These tabs provide create, list, edit, delete, search/filter/sort, and multi-select relationship management backed by authenticated server actions and Zod validation.

Relationship edits are applied through the authenticated `replace_cti_relationships` RPC, which whitelists CTI module types, validates same-project membership for the parent entity and every related ID, deduplicates submitted IDs inside the transaction, and returns generic structured errors for invalid or unauthorized relationship changes.

## Phase 5 Reports and exports

Project Reports provide authenticated CRUD, a TipTap rich-text editor, insertion of real current-project records, Knowledge Graph Report nodes, and server-side PDF, Markdown, and standalone HTML downloads. Report content is stored as structured TipTap JSON; generated HTML escapes text and permits only supported nodes/marks and HTTP/HTTPS links. PDF generation uses `@react-pdf/renderer` in a Node.js route for Vercel-compatible real PDF bytes rather than browser screenshots or renamed HTML.

## Phase 6 local Ollama AI Workspace

Migrations now run from `202607210001` through `202607210012_phase6_ai_usage.sql`. The AI Workspace is an owned-project tab that uses local Ollama only and never persists AI output without explicit approval.

Quick start: copy `.env.example` to `.env.local`, set `AI_ENABLED=true`, `AI_PROVIDER=ollama`, `AI_BASE_URL=http://127.0.0.1:11434/v1`, set `AI_MODEL` to a model you installed with Ollama, leave `AI_API_KEY` blank for local no-key Ollama, then run `npm run dev`. `npm run ai:smoke` loads `.env.local` automatically and should be used only when Ollama is running.

Production note: Vercel cannot reach a laptop-local Ollama endpoint. Keep AI disabled in Vercel unless you later provide a separately secured reachable HTTPS OpenAI-compatible endpoint.

## Phase 7 Public Demo and BYOK AI

Open `/demo` for a no-account synthetic workspace and `/demo/ai` for a pasted-text BYOK playground. Demo data is deterministic, fictional, and not persisted. Visitors cannot access real Supabase project data, upload evidence, or approve/save AI output.

BYOK supports fixed server-owned endpoints for OpenAI, OpenRouter, Groq, and NVIDIA NIM. Users provide their own API key temporarily; keys are never configured as server provider keys and are held only in an encrypted HttpOnly cookie for the session. Local Ollama remains a separate explicit provider for authenticated project workflows; the app does not silently fall back between providers.

Required Phase 7 variables are documented in `.env.example`. Apply migrations `202607230014_phase7_guest_byok.sql` and `202607230015_phase7_guest_nvidia_provider_constraint.sql` before enabling guest AI, configure Turnstile, and run `npm run guest:cleanup` from a trusted server environment for expired guest metadata cleanup.

## CİTEM Product Roadmap Phase 2.1A

Phase 2.1A introduces the Investigation foundation and IOC Workbench without replacing the internal `projects` storage model or `/projects` routes. `Project`, `projectId`, and `project_id` remain stable internal names because Evidence, CTI entities, Graph, Reports, AI, Storage paths, RLS, and tests depend on them. The user-facing term is **Investigation**.

Apply the additive migration after migration 015:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/202607280016_phase2_1a_investigation_ioc_workbench.sql
```

### Investigation metadata

Existing project rows remain valid. New Investigations add a research question, analytical status, current assessment, assessment confidence, and optional closed date. Status and assessment confidence are separately filterable in the existing `/projects` registry.

### IOC Workbench

The existing `tab=indicators` route and Indicators table remain authoritative. The UI presents this tab as **IOC Workbench** and keeps single-Indicator CRUD plus existing Threat Actor, Campaign, and Malware relationships.

Bulk intake has two explicit steps:

1. **Preview** — server-side type detection, conservative refanging, validation, input-duplicate detection, and database duplicate checks. Preview performs no writes and never fetches or resolves an IOC.
2. **Import** — the server repeats every check, imports only valid unique candidates, preserves successful rows when other rows are invalid, and returns exact partial-success counts.

Supported automatic bulk types are IPv4, IPv6, domain, URL, MD5, SHA-1, SHA-256, and email. Common `[.]`, `hxxp://`, and `hxxps://` forms are handled conservatively. CVE identifiers are explicitly redirected to the existing CVE module. FILE and REGISTRY remain available in the manual Indicator form.

### Observed, canonical, and defanged values

- **Observed value** is the trimmed line exactly accepted from analyst input.
- **Canonical value** is the validated value used by the existing project/type/normalized-value uniqueness rule.
- **Safe defanged display** is presentation-only and is not used as the canonical database identity.

`indicator_observations` stores observed value, observed/ingested time, origin, source label, analyst note, confidence, and `created_by`. A composite `(project_id, indicator_id)` foreign key prevents cross-Investigation links. RLS uses existing project ownership and requires `created_by = auth.uid()` for writes. Deleting an Indicator cascades its observations.

### Indicator assessment

Indicators now have an analyst status, rationale, and current relevance. Status answers the analyst's present verdict; confidence answers how strong the supporting information is. Existing confidence and relationship behavior remain intact.

### Security boundaries and limitations

Bulk actions use the authenticated Supabase client and existing RLS; no service-role key is used. The import RPC is security-invoker, checks owned-project access, preserves canonical uniqueness, and writes the Indicator plus observation in one transaction.

Phase 2.1A does **not** add structured Sources, enrichment providers, passive DNS/WHOIS/reputation queries, infrastructure clusters, Graph provenance fields, Attribution Analysis, new report types, report versions, feeds, alerts, SIEM/SOAR integration, or strategic analysis. Those capabilities require separately reviewed later phases.

## CİTEM Product Roadmap Phase 2.1B — Source Registry, Provenance and Enrichment Foundation

Phase 2.1B answers two operational questions: where information came from, and what additional technical context a provider returned for an Indicator.

Apply the additive migration after migration 016:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/202607280017_phase2_1b_sources_enrichment.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/202607290018_phase2_1b_enrichment_hardening.sql
```

When the migration is applied through Supabase SQL Editor, run this separately afterward:

```sql
NOTIFY pgrst, 'reload schema';
```

### Source Registry

Sources are structured project-owned citation identities. They are intentionally distinct from Evidence artefacts, Indicator observations, enrichment results, and AI report-source aliases. The Investigation research-artefact navigation exposes **Evidence** and **Sources**. Source records support create, search, filter, edit, archive, restore, same-project Evidence linking, reference counts, and safe deletion of unreferenced records. Referenced Sources must be archived rather than hard-deleted.

Indicator observations can link, replace, or remove a structured Source while preserving the original `source_label`. Display precedence is structured Source, legacy label, then `No source recorded`.

### Enrichment foundation

Enrichment uses a separate server-only provider registry and never reuses AI BYOK cookies, credentials, vault code, guest sessions, or rate-limit tables. Provider adapters receive only canonical Indicator value/type, an `AbortSignal`, and bounded context. No service-role key or browser-supplied provider URL is used.

Phase 2.1B implements only `fixture_cti` (**Deterministic Test Provider**). It performs no network request, is disabled by default, and is visibly labelled TEST / SYNTHETIC. Enable it for local/Preview acceptance with:

```text
ENRICHMENT_ENABLED=true
ENRICHMENT_FIXTURE_ENABLED=true
```

Fixture results are strict schema-versioned normalized data with bounded attributes and provider-observed related Indicators. They never automatically create Indicators, Graph edges, Timeline events, clusters, or analyst verdicts. A provider verdict remains external context and does not change Indicator status, confidence, rationale, or relevance.

Raw response storage is disabled by default. When explicitly enabled, only bounded sanitized JSON is stored; secret-like keys are stripped and oversized content is replaced by a truncation marker. Enrichment runs preserve history, safe failures, provider Source provenance, timestamps, freshness, and SHA-256 response hashes.

Detailed architecture, security, migration-history verification, environment settings, acceptance steps, known limitations, and Phase 2.1C–E exclusions are documented in `docs/PHASE_2_1B.md`.

Migration 018 makes enrichment results append-only, denies run deletion, freezes run
identity and terminal history, validates lifecycle/result inserts, and recovers stale
active runs as `FAILED`/`STALE_RUN` without removing previous results. Limited writes
remain available to the authenticated server flow; complete prevention of same-owner
direct Supabase writes requires a stronger trusted-server boundary and is not claimed.

## CİTEM Product Roadmap Phase 2.1C — Infrastructure Analysis

Phase 2.1C adds analyst-controlled Infrastructure Clusters, member roles/rationales/confidence, provenance links, assessments, and derived Graph nodes/edges while preserving `projects`, `/projects`, and `?tab=` conventions. A cluster is a technical assessment, not attribution. Apply the single migration `supabase/migrations/202607300019_phase2_1c_infrastructure_analysis.sql` after 018, then run `NOTIFY pgrst, 'reload schema';`. See [docs/PHASE_2_1C.md](docs/PHASE_2_1C.md) for security boundaries, verification SQL, limitations, and acceptance steps.
# Phase 2.1D

CİTEM now supports analyst-controlled structured attack Timeline events and Campaign Reconstruction, including technical-entity/provenance links and derived Campaign-to-Infrastructure Graph relationships. See [Phase 2.1D](docs/PHASE_2_1D.md) for semantics, migration, security, verification, and acceptance instructions.

### Phase 2.1E — Attribution Analysis

Campaign attribution now supports analyst-defined competing hypotheses, a shared evidence inventory, per-hypothesis diagnostic evaluations, an explicit current judgement, and archive-safe history. A preferred hypothesis remains an assessment and never creates a Campaign-to-Threat Actor relationship. See [Phase 2.1E](docs/PHASE_2_1E.md).

### Phase 2.1F — Intelligence Products
Reports now distinguish an editable workspace from explicit immutable assessment versions, with product lifecycle metadata, publication/supersession, snapshot provenance, version history and version-specific PDF/Markdown/HTML exports. See [Phase 2.1F](docs/PHASE_2_1F.md).

### Phase 2.2A — Research Feeds
Investigation **Research Feeds** provide explicit, server-only RSS, Atom, and JSON Feed collection with DNS-pinned SSRF protection, bounded XML normalization, transactional cross-feed deduplication, fetch history, and owner-scoped RLS. Collected items remain untrusted and separate from Evidence and analytical Sources. See [Phase 2.2A](docs/PHASE_2_2A.md).


### Global OSINT (Phase 2.2B)
The top-level `/osint` workspace provides owner-scoped RSS, Atom, and JSON Feed intelligence collection, a unified feed, triage, scheduled secure ingestion, and explicit Investigation links. Deployment and acceptance details are in [`docs/PHASE_2_2B.md`](docs/PHASE_2_2B.md).
