# Phase 2.1D — Attack Timeline and Campaign Reconstruction

> Campaign Reconstruction organises observed and inferred Timeline events into an analyst-controlled operational sequence. It records which technical entities and Infrastructure Clusters participated, what evidence supports each event, what remains uncertain, and whether the activity forms a coherent Campaign. Reconstruction is not Threat Actor attribution.

## Semantics and design

`timeline_events` remains the sole event model. An event records what happened and when; `campaign_timeline_events` records the separate, revisable analyst judgement that the event belongs to a Campaign. `OBSERVED` means supported by directly recorded material. `INFERRED` means derived through analyst judgement—not false—and requires rationale. Event assessments progress through `RECORDED`, `ASSESSED`, `DISPUTED`, and `RETRACTED`. Activity phases are `INFRASTRUCTURE_PREPARATION`, `TARGETING`, `DELIVERY`, `INITIAL_ACCESS`, `EXECUTION`, `PERSISTENCE`, `COMMAND_AND_CONTROL`, `COLLECTION`, `EXFILTRATION`, `IMPACT`, `INFRASTRUCTURE_CHANGE`, `OTHER`, and `UNKNOWN`; they do not replace MITRE mappings.

Each Campaign has at most one current reconstruction (`DRAFT` or `ASSESSED`) and an activity status of `UNKNOWN`, `ACTIVE`, `DORMANT`, or `CONCLUDED`. Event and Campaign-to-cluster memberships preserve `POSSIBLE`, `CONFIRMED`, `REJECTED`, and `REMOVED` judgements. Campaign support is derived from its linked events rather than duplicated. Timeline events link to existing Indicators, Infrastructure Clusters, Malware, CVEs, and MITRE Techniques, and separately to Sources, Evidence, or enrichment results. Source links always lead to an internal CİTEM record; no Source URL is fetched.

The Graph derives Campaign-to-Infrastructure Cluster edges from the authoritative membership table. Possible and confirmed edges are shown normally; rejected and removed edges use the existing historical-infrastructure toggle. Timeline events are not Graph nodes.

## Control, security, and deletion

All creation, classification, membership, and assessment is explicit analyst action. Nothing automatically creates events or Campaigns, infers phases, links records, changes Indicator/cluster assessment, attributes Threat Actors, or mutates Reports, Tasks, AI, or BYOK data. Every new table uses owner-scoped RLS and same-Investigation composite foreign keys. Server actions authenticate, verify ownership, validate strict bounded input, and return controlled errors.

POSSIBLE and CONFIRMED Campaign memberships block Timeline event deletion. Analysts must first reassess them as REJECTED or REMOVED. Those historical rows remain visible until the analyst uses the dedicated, confirmed **Unlink historical membership** action. Migration 020 permits owner-scoped deletion only for REJECTED or REMOVED memberships and a database trigger rejects deletion of active memberships. The Timeline event remains protected by `ON DELETE RESTRICT`, so no Campaign reconstruction history disappears through a cascade.

## Apply and verify

Apply `supabase/migrations/202607300020_phase2_1d_campaign_reconstruction.sql` **after migrations 001–019**, then separately run:

```sql
NOTIFY pgrst, 'reload schema';
```

Verification queries:

```sql
select table_name from information_schema.tables where table_schema='public' and table_name in ('campaign_reconstructions','campaign_timeline_events','campaign_infrastructure_clusters','timeline_event_entities','timeline_event_support');
select column_name,data_type,udt_name from information_schema.columns where table_schema='public' and table_name='timeline_events' and column_name in ('basis','activity_phase','assessment_status','confidence','analyst_rationale','occurred_end_at');
select typname, enumlabel from pg_type join pg_enum on enumtypid=pg_type.oid where typname in ('timeline_event_basis','attack_activity_phase','timeline_assessment_status','reconstruction_status','campaign_activity_status','campaign_membership_status','timeline_entity_role') order by typname,enumsortorder;
select conrelid::regclass,conname,pg_get_constraintdef(oid) from pg_constraint where conrelid in ('public.timeline_events'::regclass,'public.campaign_reconstructions'::regclass,'public.campaign_timeline_events'::regclass,'public.campaign_infrastructure_clusters'::regclass,'public.timeline_event_entities'::regclass,'public.timeline_event_support'::regclass);
select tablename,indexname from pg_indexes where schemaname='public' and tablename like any(array['campaign_%','timeline_event%']);
select event_object_table,trigger_name from information_schema.triggers where trigger_schema='public' and event_object_table like any(array['campaign_%','timeline_event%']);
select relname,relrowsecurity from pg_class where oid in ('public.campaign_reconstructions'::regclass,'public.campaign_timeline_events'::regclass,'public.campaign_infrastructure_clusters'::regclass,'public.timeline_event_entities'::regclass,'public.timeline_event_support'::regclass);
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'campaign_reconstructions',
    'campaign_timeline_events',
    'campaign_infrastructure_clusters',
    'timeline_event_entities',
    'timeline_event_support'
  )
order by tablename, cmd;
```

Run `scripts/test-phase2-1d-migration.sh` with PostgreSQL 16+ client/server tools. It applies migrations 001–020 in a real temporary PostgreSQL database transaction with minimal auth/storage stubs, verifies legacy Timeline compatibility, exact-one and same-Investigation constraints, restricted deletion, triggers, RLS and policies, rolls back, and removes the database. The hardening pass completed this test with PostgreSQL 16.14. This is not live Supabase validation.

## Live acceptance checklist

1. Create one Investigation containing multiple Indicators and one each of Infrastructure Cluster, Malware, CVE, MITRE Technique, Source, Evidence, enrichment result, and Campaign.
2. Create an OBSERVED event; attach Source, Evidence, Indicator, and cluster; refresh and confirm persistence.
3. Create an INFERRED event with rationale; attach Malware, CVE, MITRE Technique, and enrichment result.
4. Link both events to the Campaign; make one POSSIBLE and one CONFIRMED; add confidence, rationale, and sequence order.
5. Link the cluster to the Campaign, then record objective, current assessment, activity status, next expected activity, uncertainties, and mark the reconstruction ASSESSED.
6. Verify ordered Campaign activity. Reject/remove an event membership and a cluster membership, and verify each only under historical display/Graph toggle.
7. Verify the Campaign-to-cluster Graph edge and that a referenced event cannot be silently deleted.
8. With a second user, verify denial for event detail, reconstruction, memberships, entity links, and support. Verify all cross-Investigation links fail.
9. Regression-check IOC Workbench, Evidence, Sources, enrichment, Infrastructure, Timeline, Campaigns, Graph, Reports, AI, and BYOK.

## Known limitations and exclusions

No automatic extraction, event/Campaign creation, membership, phase inference, background reconstruction, enrichment provider, passive DNS, scanning, IR/SIEM/SOAR response, blocking, Threat Actor attribution/scoring, strategic/geopolitical analysis, ANLAK handoff, gap/collection-plan management, report versioning, specialised products, or Phase 2.1E work is included. Sequence order is only a timestamp tie-break aid. Assessment history is preserved through the current mutable reconstruction record and historical membership statuses; reconstruction versioning is not introduced.
