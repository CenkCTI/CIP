# Investigation Direction — Stage 1

## Purpose

Stage 1 of the CİTEM intelligence-production workflow is **Direction**. It gives the analyst enough structure to keep an Investigation tied to an intelligence need without turning the workflow into a mandatory wizard.

The existing `projects` row remains the Investigation root. No new top-level workfile object is introduced.

## UI model

There are still only two Investigation interaction surfaces plus the existing registry:

1. `/projects` — Investigation registry.
2. `/projects/new` — lightweight creation flow.
3. `/projects/[id]?tab=overview` — Investigation detail / direction workspace.

No separate pages are introduced for scope, questions, information gaps, or decision context.

### Create Investigation

Creation intentionally asks only for:

- title,
- primary intelligence question,
- purpose / objective,
- priority.

The Investigation starts as `DRAFT` and `CTI`. Scope, supporting questions, gaps, consumer, product type, and lifecycle metadata are refined from the Investigation overview after creation.

### Investigation overview

The existing overview becomes the Stage 1 direction workspace. It presents:

- **Intelligence requirement** — primary question and purpose.
- **Decision context** — intended consumer, intended use, expected product.
- **Scope** — geography, time range, sector, activity type, actors/clusters, technologies, and explicit exclusions.
- **Supporting intelligence questions** — lightweight analyst-authored questions used to decompose the primary question.
- **Current understanding** — working knowledge carried into the Investigation.
- **Information gaps** — unknowns that can later drive collection.
- **Workspace counts** — existing Notes, Evidence, Timeline, Indicators, and other owned records remain visible but subordinate to the intelligence direction.

Editing is kept behind one expandable **Direction, scope & lifecycle** editor so the overview reads as an intelligence workspace rather than a permanent form.

## Analyst-control rules

- Direction fields are analyst-authored.
- Nothing in Stage 1 automatically creates Evidence, entities, relationships, Campaigns, Threat Actors, Indicators, or assessments.
- Supporting questions and information gaps are not workflow gates.
- Scope guides collection but does not block the analyst from following relevant leads.
- `current_knowledge` is explicitly working context, not automatically promoted to a verified fact or Evidence item.
- `expected_product_type` remains free text at this stage to avoid prematurely constraining the production model.

## Persistence

Migration `202609110053_investigation_direction_stage1.sql` adds direction metadata to `public.projects`. Existing ownership and RLS boundaries continue to apply because no new owner-scoped root table is introduced.

Line-based working lists are stored as bounded `text[]` columns:

- `supporting_questions`
- `current_knowledge`
- `information_gaps`
- scope list fields

This is deliberately lightweight for Stage 1. Later workflow stages may promote individual gaps or questions into richer collection or analytical objects without changing their Stage 1 role.
