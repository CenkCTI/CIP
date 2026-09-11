# Investigation Direction — Stage 1

## Purpose

Stage 1 of the CİTEM intelligence-production model is **Direction**. It keeps an Investigation tied to an intelligence need without turning the intelligence cycle into a wizard, checklist, or unlock sequence.

The existing `projects` row remains the Investigation root. No new top-level workfile object is introduced.

The design principle is:

> CİTEM structures the intelligence need and preserves analytical context; it does not decide what the analyst should conclude.

## User surfaces

There are still only three user-facing Investigation surfaces:

1. `/projects` — Investigation registry.
2. `/projects/new` — lightweight creation flow.
3. `/projects/[id]?tab=overview` — Investigation detail / Stage 1 direction workspace.

Scope, questions, information gaps, working knowledge, and decision context do **not** get separate pages.

## Create Investigation

Creation deliberately asks only for:

- title,
- primary intelligence question,
- purpose / objective,
- priority.

The Investigation starts as `DRAFT` and `CTI`. Owner comes from the authenticated user. No actor, campaign, IOC, assessment, scope, Collection plan, or Evidence record is required before the Investigation can exist.

## Investigation Overview

The Overview is ordered by analytical importance rather than record counts:

1. **Intelligence Requirement** — primary question and purpose.
2. **Decision Context + Scope** — intended consumer, intelligence use, expected product, geography, time, sectors, activity types, actor/cluster scope, technologies, and explicit exclusions.
3. **Supporting Intelligence Questions** — decomposed analytical questions with their own status and order.
4. **Current Understanding** — active working knowledge beside explicit information gaps.
5. **Related Intelligence** — deterministic, read-only previous-Investigation suggestions.
6. **Investigation Content** — existing workspace record counts, subordinate to Direction.

Lifecycle metadata (`status`, `priority`, optional intelligence deadline) is available without being conflated with intelligence-production stages.

## Analyst-control rules

- Direction fields are analyst-authored.
- Stage 1 is not a workflow gate. There is no `Complete Stage 1` action.
- Investigation lifecycle status is not the same thing as intelligence-cycle stage.
- Nothing automatically creates Evidence, entities, relationships, Campaigns, Threat Actors, Indicators, hypotheses, or assessments.
- Scope guides collection and relevance; it never prevents an analyst from following a relevant lead.
- Supporting questions are questions, not tasks.
- Information gaps are unknowns, not tasks. A later Collection stage may explicitly promote a gap into a Collection requirement.
- Working knowledge is analyst context, not automatically a fact, assessment, or verified Evidence item.
- Linking a Source or Evidence record to working knowledge provides provenance only; it does not mark the statement verified.
- `expected_product_type` remains free text with UI suggestions so Direction does not prematurely constrain product design.

## Persistence model

Migration `202609110053_investigation_direction_stage1.sql` is additive over the existing Investigation foundation.

### `projects` root metadata

Direction metadata that belongs to the Investigation itself remains on `projects`:

- `purpose`
- `intended_consumer`
- `decision_context`
- `expected_product_type`
- `due_at`
- `scope_geography[]`
- `scope_sectors[]`
- `scope_activity_types[]`
- `scope_actors[]`
- `scope_technologies[]`
- `scope_time_start`
- `scope_time_end`
- `out_of_scope`

Existing `research_question`, `priority`, and `investigation_status` remain authoritative.

### First-class working records

Analyst working objects that need lifecycle, order, provenance, or later Collection handoff are normalized rather than stored as `text[]`:

- `investigation_questions`
  - `OPEN`
  - `PARTIALLY_ANSWERED`
  - `ANSWERED`
  - `DROPPED`
- `investigation_information_gaps`
  - `OPEN`
  - `PARTIALLY_RESOLVED`
  - `RESOLVED`
  - `DEFERRED`
- `investigation_working_knowledge`
  - `ACTIVE`
  - `SUPERSEDED`
  - `WITHDRAWN`
- `investigation_working_knowledge_support`
  - exactly one same-Investigation Source or Evidence target per link

Every new child table is owner-isolated through `project_id`, `project_is_owned(project_id)`, RLS, and same-Investigation foreign-key constraints.

## Working knowledge provenance

A working knowledge statement may have zero or more support links. Support can point to an existing Investigation Source or Evidence record. The UI labels those links as support/provenance, never as truth or verification.

Cross-Investigation support links are rejected by composite foreign keys.

## Related Intelligence

The first implementation intentionally suggests only previous Investigations. It uses deterministic overlap from:

- geography,
- sector,
- actor/activity-cluster scope,
- activity type,
- tags,
- title/question terms.

The score is internal. The analyst sees only why a candidate may be relevant. No relationship is created automatically.

## Stage 2 handoff boundary

Stage 1 ends conceptually with a directed Investigation, not with a completed form. Later Collection work can use:

`Primary / Supporting Question → Information Gap → Collection Requirement → Collection Task`

The Direction implementation does not create those Collection objects yet.

## Validation

Stage 1 ships with:

- Zod validation for root direction metadata and first-class records,
- schema tests for requirement, scope, lifecycle, working-record statuses, and provenance cardinality,
- PostgreSQL migration acceptance for date constraints, same-Investigation provenance, and owner RLS,
- the existing CI lint, typecheck, unit-test, build, and migration suite.
