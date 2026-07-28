# CİTEM Product Roadmap Phase 2.1B — Source Registry, Provenance and Enrichment Foundation

Phase 2.1B extends the existing Investigation and IOC Workbench without replacing Projects, Evidence, Indicator observations, Graph, Reports, AI Workspace, or BYOK.

## Data-model distinctions

- **Source** identifies where information originated and stores citation metadata.
- **Evidence** stores the actual project artefact: a file, screenshot, PDF, article, log, PCAP, or other research object. Private Storage paths remain in the existing Evidence system.
- **Indicator observation** preserves how and when a canonical Indicator was observed.
- **Enrichment result** stores provider-returned technical context for one Indicator at one query time.
- **AI report source alias** remains the existing allowlisted `ReportSourceRef` model. It is not the Source Registry and was not renamed.

Source reliability assesses the Source itself. Indicator/result confidence assesses how strong the supporting information is. These values are intentionally separate.

## Migration 017

Apply migrations in filename order. Migration 017 is additive and does not modify migrations 001–016:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/202607280017_phase2_1b_sources_enrichment.sql
```

When applying through the Supabase SQL Editor, copy the SQL file contents rather than the repository path. After the migration succeeds, reload the PostgREST schema cache in a separate query:

```sql
NOTIFY pgrst, 'reload schema';
```

Verify the objects:

```sql
select to_regclass('public.sources') as sources_table,
       to_regclass('public.enrichment_runs') as enrichment_runs_table,
       to_regclass('public.enrichment_results') as enrichment_results_table;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'indicator_observations'
  and column_name in ('source_id', 'verification_state')
order by column_name;
```

### Manual migration-history verification

Applying SQL manually does not automatically prove that Supabase CLI migration history matches the repository. Before a later `supabase db push`, inspect the migration-history table:

```sql
select version, name
from supabase_migrations.schema_migrations
where version in ('202607280016', '202607280017')
order by version;
```

Do not assume synchronization when a manually applied version is absent. First verify that the live schema matches the repository migration, then deliberately repair migration history using the current Supabase CLI procedure before running `db push`. Never mark an unapplied migration as applied merely to silence the CLI.

## Source Registry

`public.sources` is project-owned and includes title, type, publisher, URL, publication/access times, reliability, origin, verification state, description, analyst notes, optional same-project Evidence link, optional stable external key, archive state, creator, and timestamps.

The Investigation workspace exposes Evidence and Sources as contained research-artefact navigation. The preferred Sources entry is:

```text
/projects/[id]?tab=evidence&view=sources
```

It resolves to the persistent Source Registry route. Existing links without `view` continue to open Evidence.

Source behaviour:

- create, search, filter, edit, archive, and restore are persistent;
- active Sources are the default selection set;
- archived Sources remain visible historically;
- unreferenced Sources may be deleted;
- observation- or enrichment-referenced Sources cannot be hard-deleted;
- linked Evidence remains a separate artefact and is not duplicated into Source fields.

## Observation provenance

Migration 017 adds optional `source_id` and `verification_state` to `indicator_observations`.

Display precedence is:

1. linked structured Source;
2. legacy `source_label`;
3. `No source recorded`.

Legacy `source_label` data is preserved. Analysts can link, replace, or remove a structured Source without deleting the Source or rewriting the original observed value.

The visible provenance chains are:

```text
Indicator → Observation → Source
Indicator → Enrichment Run → Enrichment Result → Source
```

## Enrichment provider boundary

Enrichment uses a separate server-only registry. It does not reuse:

- AI BYOK cookies;
- AI provider credentials;
- BYOK vault code;
- guest AI sessions;
- AI rate-limit tables;
- service-role keys.

Provider adapters receive only canonical Indicator value/type, an `AbortSignal`, and bounded request context. Any future network adapter must use a fixed server-owned HTTPS origin and path constructor. The browser cannot provide a provider base URL.

## Deterministic fixture provider

Phase 2.1B implements one provider:

```text
ID: fixture_cti
Display name: Deterministic Test Provider
Type: TEST / SYNTHETIC
Network requests: none
```

Enable it only for local or Preview acceptance:

```text
ENRICHMENT_ENABLED=true
ENRICHMENT_FIXTURE_ENABLED=true
```

It is disabled by default and never presented as live intelligence. It returns deterministic synthetic DNS, network, registration, reputation, or malware context for supported domain, IP, URL, and hash Indicators.

The fixture does not automatically create Indicators, relationships, Graph edges, Timeline events, clusters, or analyst verdicts.

## Run lifecycle and controls

The server performs:

1. authentication;
2. Investigation ownership verification;
3. Indicator membership verification;
4. fixed provider resolution;
5. enablement and type checks;
6. active-run and cooldown checks;
7. run creation;
8. bounded provider execution;
9. strict response validation;
10. provider Source creation/reuse;
11. normalized-result persistence;
12. safe run completion/failure recording.

Controls include one active run per Investigation/Indicator/provider, configurable cooldown, timeout, normalized result limits, response-size policy, and safe errors. Failed runs remain visible and do not delete prior successful results.

## Normalized results and raw-response policy

Normalized results are schema version 1 and contain bounded summary text, bounded primitive attributes, bounded provider-observed related Indicators, and an optional provider verdict. Provider-observed related Indicators remain context only.

Raw response storage is disabled by default:

```text
ENRICHMENT_STORE_RAW_RESPONSES=false
```

When explicitly enabled, only bounded sanitized JSON supplied by the adapter is stored. Authorization, cookie, token, secret, password, and API-key fields are removed; oversized data is replaced with a truncation marker. A SHA-256 response hash is stored for result comparison.

## Analyst-assessment boundary

A provider verdict is external technical context, not CİTEM's final analyst assessment. Enrichment never automatically changes Indicator status, confidence, analyst rationale, or current relevance.

AI cannot issue provider queries, invent provider results, verify Sources, or write enrichment results.

## RLS and same-project safety

`public.sources`, `public.enrichment_runs`, and `public.enrichment_results` have RLS enabled. Policies use existing Investigation ownership. `created_by` and `requested_by` must equal `auth.uid()` on inserts/updates. Composite foreign keys prevent cross-Investigation Evidence, Indicator, run, observation, result, and Source links.

User-facing flows use the authenticated Supabase client. No service-role bypass is introduced.

## Acceptance

1. Create `Synthetic Vendor Report` in the Source Registry and optionally link existing Evidence.
2. Link it to the `secure-energy[.]example` observation.
3. Enable `ENRICHMENT_ENABLED=true` and `ENRICHMENT_FIXTURE_ENABLED=true`, then redeploy.
4. Run `fixture_cti` on `secure-energy.example`.
5. Verify synthetic normalized results, provider Source reuse, timestamps, freshness, and unchanged Indicator assessment.
6. After cooldown, run again and verify history is appended rather than overwritten.
7. Run against an unsupported Indicator type and verify a controlled failed run.
8. With a second user, verify Source, observation provenance, enrichment history, and run actions are inaccessible.
9. Regression-check IOC bulk intake, Evidence, Graph, Reports/exports, AI Workspace, and BYOK.

## Known limitations

- No live third-party provider is implemented.
- No scheduled/background enrichment worker is implemented.
- Browser acceptance requires migration 017 on the configured Supabase project and fixture environment flags on the deployed server.
- The connector coding environment cannot apply the live migration or provide two live user credentials; live checks must be recorded as repository-owner manual verification.

## Explicitly deferred

Phase 2.1B does not implement Infrastructure Clusters, Graph Source nodes or edge provenance, Timeline redesign, automatic Timeline events, Attribution Analysis, new report types, immutable report versions, feeds, watchlists, alerts, scheduled enrichment, background workers, SIEM/SOAR integration, active scanning, user-stored enrichment keys, world maps, ANLAK integration, strategic analysis, or Phase 2.1C–E.
