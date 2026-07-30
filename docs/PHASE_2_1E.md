# Phase 2.1E — Attribution and Competing Assessments

> Attribution Analysis compares multiple analyst-defined hypotheses against a shared Campaign evidence inventory. Each evidence item may support, contradict or remain neutral toward each hypothesis. A preferred hypothesis is the analyst’s current best explanation, not a confirmed fact and not an automatic Campaign-to-Threat Actor relationship.

## Model and doctrine

A Campaign has at most one current assessment and any number of analyst-created hypotheses. Subjects may be an `EXISTING_THREAT_ACTOR`, `ACTOR_CLASS`, `UNKNOWN_ACTOR`, or `NON_ATTRIBUTION_ALTERNATIVE`. Analytical statuses are `DRAFT`, `ACTIVE`, `DISFAVORED`, and `REJECTED`; `archived_at` independently preserves historical records and restoring does not rewrite status.

The shared inventory explicitly links one Source, Evidence record, Timeline event, Infrastructure Cluster, Indicator, enrichment result, Malware, or MITRE Technique. Each hypothesis/item pair may have one `SUPPORTS`, `CONTRADICTS`, or `NEUTRAL` evaluation and `LOW`, `MEDIUM`, or `HIGH` diagnostic value. Diagnostic value means discriminating usefulness, not points. Missing matrix cells remain **NOT YET ASSESSED**. Counts are descriptive—not scores, probabilities, ranks, proof, or an automated winner.

Preferred selection is an explicit assessment action. It cannot reference a rejected/archived hypothesis, and the database prevents later rejection/archive while preferred. Hypotheses never create or alter semantic `campaign_threat_actors` relationships or Graph nodes/edges. Threat Actor detail shows read-only analytical backlinks with this distinction.

## Security and archive behavior

All four tables use owner-scoped RLS. Inserts require `created_by = auth.uid()`; composite foreign keys enforce the same Investigation and, for evaluations/preference, same Campaign. Server actions repeat owned-project, Campaign, hypothesis, evidence, actor, and referenced-record checks and return controlled errors. Hypotheses/evidence are archive-first; evaluations can be explicitly unlinked without deleting either endpoint. Source URLs are never fetched.

## Apply and verify

Apply `supabase/migrations/202607300021_phase2_1e_attribution_competing_assessments.sql` **only after migrations 001–020**, then execute:

```sql
NOTIFY pgrst, 'reload schema';
select table_name from information_schema.tables where table_schema='public' and table_name like '%attribution%';
select typname, enumlabel from pg_type join pg_enum on pg_enum.enumtypid=pg_type.oid where typname like 'attribution_%' order by typname,enumsortorder;
select table_name,column_name,data_type from information_schema.columns where table_name in ('campaign_attribution_assessments','attribution_hypotheses','attribution_evidence_items','attribution_evidence_evaluations');
select conrelid::regclass,conname,pg_get_constraintdef(oid) from pg_constraint where conrelid in ('public.campaign_attribution_assessments'::regclass,'public.attribution_hypotheses'::regclass,'public.attribution_evidence_items'::regclass,'public.attribution_evidence_evaluations'::regclass);
select tablename,indexname,indexdef from pg_indexes where tablename like '%attribution%';
select event_object_table,trigger_name from information_schema.triggers where event_object_table like '%attribution%';
select relname,relrowsecurity from pg_class where relname like '%attribution%';
select tablename,policyname,cmd from pg_policies where tablename like '%attribution%';
```

Run `scripts/test-phase2-1e-migration.sh` against PostgreSQL 16+. It uses minimum Supabase stubs and a temporary transaction; it is not live Supabase validation.

## Live acceptance checklist

1. Open an existing reconstructed Campaign.
2. Create existing-actor, unknown-actor, and non-attribution hypotheses.
3. Add Source, Evidence, Timeline, Cluster, Indicator, and enrichment evidence.
4. Evaluate the same evidence against multiple hypotheses using all three impacts.
5. Verify NOT YET ASSESSED cells, assumptions, weaknesses, and gaps.
6. Mark one hypothesis DISFAVORED; save MULTIPLE_PLAUSIBLE; explicitly change to PREFERRED_HYPOTHESIS.
7. Confirm the preferred hypothesis cannot be rejected/archived and no semantic actor relationship or Graph edge appears.
8. Confirm actor backlink wording, historical toggle, second-user denial, and cross-Investigation rejection.
9. Regression-check Timeline, reconstruction, Graph, Reports, AI, and BYOK.

## Known limitations and exclusions

No automatic suggestions, AI attribution, scoring/weighting/probability, confidence calculation, ranking, winner selection, Graph overlay, semantic actor links, provider ingestion, deception detection, identity/geopolitical assessment, ANLAK handoff, collection/task automation, report versioning, immutable snapshots, or Phase 2.1F work is included. Live Supabase acceptance still requires owner execution.
