# Phase 2.1C — Infrastructure Analysis

> “An Infrastructure Cluster groups Indicators that may form part of the same attack infrastructure. It records the role, rationale, confidence, observation period and supporting material for each membership. A cluster is an analyst assessment, not an automatic attribution claim.”

## Analyst-controlled model

Infrastructure Analysis helps answer what shared infrastructure a set of Indicators represents and why it matters operationally. Analysts explicitly create every cluster and membership, choose its role and confidence, explain the rationale, and attach existing provenance. No enrichment, shared technical property, AI process, or graph process creates or changes analysis.

Cluster statuses are **DRAFT** (being assembled), **ASSESSED** (current assessment completed), **INACTIVE** (no longer active/relevant), and **ARCHIVED** (historical and hidden from active lists). Membership statuses are **POSSIBLE** (uncertain), **CONFIRMED** (sufficiently supported), **REJECTED** (examined and excluded), and **REMOVED** (formerly active); history is retained.

Roles describe probable function: **PHISHING**, **CREDENTIAL_HARVESTING**, **REDIRECTOR**, **PAYLOAD_DELIVERY**, **COMMAND_AND_CONTROL**, **STAGING**, **EXFILTRATION**, **MALWARE_HOSTING**, **SCANNING**, **INFRASTRUCTURE_SUPPORT**, or **UNKNOWN**. Membership is a technical assessment and never Threat Actor attribution.

## Provenance, graph, and security

Cluster-wide or membership-specific support points to exactly one existing same-Investigation Source, Evidence item, or enrichment result, with an analyst note. Foreign keys use `(project_id, id)` boundaries and `RESTRICT` protects referenced provenance. The UI never visits Source URLs or displays raw enrichment responses/secrets.

The Graph derives cluster nodes and membership edges directly from `infrastructure_clusters` and `infrastructure_cluster_members`; no parallel relationship is written. POSSIBLE and CONFIRMED edges appear by default. The explicit historical toggle includes REJECTED and REMOVED edges; edge labels expose status, role, and confidence, with rationale in edge metadata.

All three tables have owner-scoped authenticated RLS. Server actions additionally validate UUIDs, ownership, the owned cluster, and same-Investigation targets. Clusters/members have no DELETE policy; archive/status transitions preserve analysis. Support links may be explicitly unlinked.

## Apply migration 019

The migration was authored but is not applied by the coding environment. Apply it after 018:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/202607300019_phase2_1c_infrastructure_analysis.sql
psql "$SUPABASE_DB_URL" -c "NOTIFY pgrst, 'reload schema';"
```

Do not alter Supabase migration history to bypass a mismatch. Verify:

```sql
select table_name from information_schema.tables where table_schema='public' and table_name like 'infrastructure_cluster%';
select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name like 'infrastructure_cluster%' order by 1,ordinal_position;
select conrelid::regclass,conname,pg_get_constraintdef(oid) from pg_constraint where conrelid in ('public.infrastructure_clusters'::regclass,'public.infrastructure_cluster_members'::regclass,'public.infrastructure_cluster_support'::regclass);
select relname,relrowsecurity from pg_class where oid in ('public.infrastructure_clusters'::regclass,'public.infrastructure_cluster_members'::regclass,'public.infrastructure_cluster_support'::regclass);
select tablename,policyname,cmd from pg_policies where schemaname='public' and tablename like 'infrastructure_cluster%';
select event_object_table,trigger_name,event_manipulation from information_schema.triggers where event_object_schema='public' and event_object_table like 'infrastructure_cluster%';
```

## Live acceptance checklist

1. Create an Investigation containing multiple Indicators.
2. Create an Infrastructure Cluster; refresh and confirm persistence.
3. Add two existing Indicators and assign different roles.
4. Set one membership POSSIBLE and one CONFIRMED; add rationale and confidence.
5. Link a Source to the cluster, Evidence to a membership, and an enrichment result where applicable.
6. Write current assessment and operational relevance.
7. Open Graph and verify cluster/member edges; enable historical relationships after rejecting/removing one.
8. Archive and restore the cluster; verify duplicate membership is rejected.
9. Verify a second user cannot view or modify it and cross-Investigation support links are rejected.
10. Regression-check IOC Workbench, Evidence, Sources, enrichment, Timeline, Reports, Graph, AI and BYOK.

## Known limitations and exclusions

No automatic clustering/suggestions, enrichment automation, discovery/scanning, attribution, actor/campaign/malware cluster links, Timeline mutation, report mutation, navigation redesign, or Phase 2.1D work is included. Search uses current Investigation records and Graph limits remain unchanged.
