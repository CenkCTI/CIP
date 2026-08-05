# Phase 2.3A — TechINT Shell and Intel Profile Foundation

TechINT is a top-level CİTEM section, positioned beside Operational picture, Investigations, OSINT, and Strategic findings. It is not nested under OSINT or Investigations.

## Product separation

TechINT has exactly three primary views:

- **Global View** (`/techint`) — an honest foundation shell for future profile-independent technical intelligence. It does not contain fake CVEs, malware, counts, provider results, prioritization, matching, alerts, reports, or AI briefs.
- **Profiles** (`/techint/profiles`) — standalone TechINT profiles only. These profiles are independent of Investigations.
- **InvestINT** (`/techint/investint`) — Investigation-linked INT Profiles only. Standalone profiles never appear in this index.

Each Investigation also has `/projects/[id]/intel-profile`, which owns creation and maintenance of the Investigation primary INT Profile.

## Data model

Migration `202608050031_phase2_3a_techint_profiles.sql` adds owner-scoped `intel_profiles`, `intel_profile_items`, and append-only `intel_profile_audit_events` tables plus strict enums for profile kind, status, priority, item origin, item state, item kind, semantic role, and audit action.

Profile kinds are strictly separated:

- `STANDALONE` requires `project_id is null`.
- `INVESTIGATION` requires an owned `project_id`.
- A partial unique index allows only one non-archived Investigation profile per Investigation.
- Archive preserves items and audit history; restore is explicit and returns profiles in a paused state.

## Item origin and state

Items preserve display snapshots and bounded normalized values without claiming canonical entity resolution. Origins are:

- `EXPLICIT` — analyst-added and may become active after valid submission.
- `DERIVED` — deterministically seeded from authoritative Investigation records and source references.
- `SUGGESTED` — ambiguous context that must start pending and never auto-activate.

States are `PENDING`, `ACTIVE`, `EXCLUDED`, and `REMOVED`. Active location items require a semantic role so infrastructure location is not confused with target geography. Duplicate active/pending items are blocked by a profile-local key. Exclusions and removals are preserved across refresh.

## Deterministic Investigation seeding

Creating or refreshing an Investigation INT Profile reads existing owned Investigation records only: threat actors, campaigns, malware, CVEs, indicators, and MITRE techniques. Refresh performs no network I/O, AI calls, background jobs, provider collection, or matching. It returns bounded counts for added, already-present, pending suggestions, and skipped records.

## RLS and audit

All new tables are owner-scoped and have RLS enabled. Composite owner/profile and owner/project foreign keys prevent cross-owner references. Server actions derive owner and actor IDs from the authenticated session and return controlled UI errors. Audit events record profile/item actions and Investigation refreshes with bounded JSON details. Authenticated users can read only their own audit history and cannot update/delete audit rows through RLS policies.

## Current exclusions

Phase 2.3A intentionally excludes technical-signal ingestion, provider collection, OTX integration, NVD/KEV/EPSS lookups, ThreatFox calls, RSS/Atom/JSON feed querying, matching, scoring, prioritization, schedulers, alerts, anomaly detection, AI briefs, and generated reports. TechINT does not depend on PR #30 or OTX.

## Live acceptance checklist

The live checklist must be performed only by an authorized operator against the deployed Supabase project: create standalone and Investigation profiles as User A, verify strict list separation, validate deterministic seeding and pending semantics, test duplicate Investigation-profile rejection, pause/resume/archive/restore, inspect audit history, and confirm User B cannot access User A records.
