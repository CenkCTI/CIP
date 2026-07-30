# Phase 2.1F — Intelligence Products and Versioned Assessments

## Model and doctrine
A **Report workspace** is the editable parent/current TipTap draft. A **Report version** is a point-in-time, immutable content and analytical-context snapshot. Product type describes intended use only: `TECHNICAL_NOTE`, `IOC_BRIEF`, `INFRASTRUCTURE_ASSESSMENT`, `CAMPAIGN_ASSESSMENT`, `ATTRIBUTION_ASSESSMENT`, `OPERATIONAL_INTELLIGENCE_REPORT`, `INCIDENT_UPDATE`, or `OTHER`.

Lifecycle states are `DRAFT`, `IN_REVIEW`, `APPROVED`, `PUBLISHED`, `SUPERSEDED`, and `ARCHIVED`; version states are independently `SAVED`, `PUBLISHED`, and `SUPERSEDED`. Analysts may select only draft, review, approved, and archived metadata states; issued states are workflow-controlled. Creating a version does not publish it. Publishing confirms and issues an immutable record, supersedes the formerly published version, and makes exactly one snapshot authoritative. Archive/restore affects the workspace, never history.

## Provenance and change awareness
Separate human-readable selectors add and unlink same-Investigation Sources, Evidence, Indicators, enrichment results, Infrastructure Clusters, Timeline events, Campaigns, Threat Actors, Malware, CVEs, MITRE Techniques, attribution hypotheses, and attribution assessments without UUID entry. PostgreSQL typed composite foreign keys validate every target and derive its label, bounded state/confidence metadata, and `updated_at`; browser labels are never authoritative. The atomic creation RPC locks the Report and snapshots every reference or rolls the entire version back. It does not copy files, private URLs, enrichment payloads, credentials, or fetch URLs.

The UI uses neutral awareness terms: unchanged; current record updated after version; archived; unavailable; or new draft reference not included. A live change never edits a snapshot, creates a version, changes confidence, or makes an old judgement “wrong.” Attribution products carry an analytical-judgement disclaimer and publication never creates Graph/Actor relationships or changes Campaign attribution.

## Exports and AI boundary
The existing PDF, Markdown, and standalone HTML endpoint accepts `?versionId=<uuid>` for immutable exports; omitting it exports the current draft. Version detail links use snapshot content and reference appendix, never live records. Existing analyst-approved AI assistance remains draft-only: AI cannot create/publish/approve/supersede versions, choose authority/status/references, or overwrite judgements.

## Security and integrity
Migration 022 adds sequential per-Report versions, exactly-one/type-matched reference columns, per-type duplicate indexes, composite same-Investigation keys, authoritative-published-version integrity, transition/deletion guards, immutable snapshot triggers, atomic creation/publication RPCs, and owner-scoped RLS. **Option A is used: saved versions are permanent too**; no version or snapshot may be deleted. Reports with any version history must be archived rather than deleted. Server actions strictly validate IDs and assessment inputs, re-check project ownership/report scope, check persistence results, and return controlled errors.

## Install and verify
Apply only after migrations 001–021, then reload PostgREST:

```sql
-- Supabase SQL editor, after applying the migration file
notify pgrst, 'reload schema';
select to_regclass('public.report_versions'), to_regclass('public.report_version_references');
select relname, relrowsecurity from pg_class where oid in ('public.report_versions'::regclass,'public.report_version_references'::regclass);
select conname from pg_constraint where conrelid='public.report_version_references'::regclass;
```

Run `scripts/test-phase2-1f-migration.sh` against disposable PostgreSQL 16+. This is a local PostgreSQL composition/smoke check, not live Supabase validation. Manually apply 022 in Supabase, reload schema, inspect policies/functions, and use two real accounts for RLS acceptance.

## Live acceptance checklist
1. Open an existing Report.
2. Set product type.
3. Add Campaign, Timeline, Cluster, and Attribution references.
4. Create version 1.
5. Edit the draft and verify version 1 is unchanged.
6. Create version 2 and publish version 2.
7. Export versions 1 and 2 independently and verify each snapshot.
8. Update a referenced analytical record and verify neutral change awareness.
9. Verify published content is not altered.
10. Verify a second user and foreign/malformed routes are denied.
11. Archive/restore and verify history survives.
12. Regression-check Reports, Evidence, Sources, IOC/enrichment, Infrastructure, Timeline, Campaign, Attribution, Graph, AI, and BYOK.

## Exclusions
No external delivery/public links, subscriptions/feeds/alerts, multi-user approval, signatures/classification, organisation templates, ANLAK handoff, strategic products, automatic collection/report generation, AI publication, or Phase 2.2 work is included.
