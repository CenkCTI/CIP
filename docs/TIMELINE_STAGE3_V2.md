# Timeline Stage 3 Workflow v2

Timeline is the temporal processing surface between collected source material and later Campaign reconstruction.

## Core job

The default workflow answers only:

1. What happened?
2. When did it happen?
3. Which exact source passage supports the event?

Campaign membership, technical relationships and broader supporting material remain available but are placed behind **Advanced connections** so analysts can record events without completing a reconstruction form.

## Event creation

The Timeline workspace exposes a single **New event** button. The modal keeps the default surface to event name, time and short description. Basis, attack/activity phase, assessment state, confidence and rationale remain under **Advanced details**.

The main Timeline list shows the analyst-facing time label, title, short description, meaningful attack/activity phase, Campaign memberships and small provenance/technical counts. It does not expose every assessment field as a badge.

## Temporal semantics

`timeline_events.event_date` remains the sortable normalized lower bound. `occurred_end_at` is the optional normalized upper bound.

`time_precision` records how much precision the analyst actually has:

- `EXACT`
- `DAY`
- `MONTH`
- `YEAR`
- `APPROXIMATE`
- `RANGE`

`time_label` preserves human wording such as `Early February 2022` when the source is approximate. Month and year inputs are normalized to bounded ranges for sorting while the UI renders only the supported precision. Publication date remains Source metadata and is not silently substituted for activity time.

## Exact source provenance

`timeline_event_source_annotations` links one Timeline event to one immutable Source Annotation. This preserves:

`Timeline Event → Source Annotation → Source → Original Asset → SHA-256`

The link is analyst-created, owner-scoped, same-Investigation and duplicate-safe. Source Annotation deletion is restricted while the provenance link exists; analysts unlink it deliberately first.

The Source Reader annotation panel exposes two lightweight actions:

- **+ Event** — create a new Timeline event and link the selected annotation.
- **Link existing** — attach the selected annotation to an existing event instead of creating a duplicate.

Opening an annotation from the Timeline event links back to the Source Reader with the annotation focused.

## Advanced connections

The event detail view keeps existing capabilities without the old full-page form density:

- Campaign membership
- Indicator / Infrastructure Cluster / Malware / CVE / MITRE Technique
- Source / Evidence / enrichment result

Quick controls use compact selectors. Technical roles are derived from record type for quick linking; Campaign links start as `POSSIBLE / LOW` and still require a short analyst rationale. Existing historical Campaign semantics remain unchanged.

## Boundaries

Timeline v2 does not perform attribution, automatic Campaign membership, automatic MITRE mapping, source reliability scoring, or automatic event extraction. It records analyst-directed temporal observations and preserves provenance for later evaluation and reconstruction.
