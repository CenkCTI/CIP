# CİTEM Intelligence Production Stage 2 — Collection

Stage 2 turns Direction-stage unknowns into analyst-directed collection activity without
turning CİTEM into a rigid workflow or an automatic analytical authority.

## Analyst model

The Stage 2 traceability chain is:

```text
Primary Intelligence Question
        ↓
Supporting Intelligence Question
        ↓
Information Gap
        ↓
Collection Requirement
        ↓
Source
        ↓
Analyst Note / Annotation
```

An Information Gap states what is not known. A Collection Requirement states what
material must be obtained to help close that gap. A Source is the material actually
collected.

CİTEM does not infer that a gap is solved because a number of Sources exist. The
`SATISFIED` Collection Requirement state is an explicit analyst judgement that the
current collection need is sufficiently covered.

## Collection workspace

`/projects/[id]/collection` presents Direction context and keeps the analyst focused
on the unknowns that should drive collection.

The workspace supports:

- creating Collection Requirements;
- linking one Requirement to one or more Information Gaps;
- priority and a small analyst-controlled lifecycle;
- seeing Source coverage per Gap and Requirement;
- opening linked Sources without treating Source count as completion;
- marking a Requirement analyst-sufficient without resolving the underlying Gap.

The 9-stage intelligence-production model is design logic, not a nine-screen wizard.
Analysts may return to Direction or Collection whenever new information changes the
question.

## Sources workspace

`/projects/[id]/sources` is a simplified research-material library.

Sources may be entered as:

- an HTTP/HTTPS URL stored as citation metadata; or
- an uploaded file retained in private Supabase Storage.

The existing project-scoped `sources` registry remains the Source identity. Stage 2
adds `collection_rationale` to preserve *why the analyst collected this Source*.

A Source can link to multiple Information Gaps and multiple Collection Requirements.
The relationship is many-to-many because a single report can support more than one
collection need.

### File sources

File bytes are uploaded directly from the browser to the private `source-assets`
bucket through a signed upload URL. Application servers do not proxy the upload bytes.

The client calculates SHA-256 before upload. CİTEM stores the hash with the immutable
Source asset for provenance and future duplicate awareness.

The v1 file-size limit is 50 MiB.

CİTEM may retain arbitrary analyst files, but only a conservative allowlist is
previewed inline. Unknown or executable-capable formats are retained as private bytes
and are not executed or rendered inside the application.

Storage paths use opaque identifiers:

```text
{userId}/{projectId}/{sourceId}/{assetId}.{extension}
```

The private bucket uses ownership-aware Storage RLS.

## Source Reader

`/projects/[id]/sources/[sourceId]` is the analyst working surface.

It provides:

- Collection context;
- Source metadata and provenance;
- Source-level analyst notes;
- private PDF/image/text viewing for supported assets;
- non-destructive HIGHLIGHT, UNDERLINE and REGION annotations;
- annotation links back to Information Gaps and Collection Requirements;
- annotation navigation/indexing;
- access to the original Source asset.

Annotations are stored separately from the original bytes. Creating or deleting an
annotation never modifies the Source file.

Annotation rectangles use normalized page coordinates from 0 to 1 rather than display
pixels so the stored geometry is independent from the analyst's screen resolution.

### PDF annotation limitation in v1

The current PDF viewer deliberately uses the browser's native PDF renderer and a CİTEM
overlay rather than introducing a new PDF-processing dependency in this stacked PR.
Region annotations are therefore analyst-drawn overlays and are not yet bound to a
PDF text layer. Exact text-selection highlighting and deterministic burn-in of
annotations across every original PDF page should move to a dedicated document
processing worker in a later hardening iteration.

This limitation does not affect original-file immutability, Source provenance, or the
Gap/Requirement traceability model.

## Collection packet

`/projects/[id]/sources/[sourceId]/print` creates a branded printable working view.

The packet contains, in order:

1. a BAYKUSH / CİTEM Source Collection cover;
2. Investigation and Source identity;
3. Collection rationale;
4. linked Information Gaps and Collection Requirements;
5. Source provenance including IDs, filename, URL and SHA-256 when available;
6. analyst notes;
7. annotation index with page/type/comment and collection links;
8. the original Source view or original-source link.

The print action records a `source_export_events` audit row before opening the browser
print dialog.

The packet is analyst working material, not an authoritative Intelligence Product.
For PDF Sources, browser printing cannot guarantee byte-perfect merging of the embedded
original PDF and the cover pages. A future document worker can replace this print
surface with deterministic PDF merge/burn-in while preserving the same data model.

## Data model

Migration `202609230054_investigation_collection_stage2.sql` adds:

- `collection_requirements`
- `collection_requirement_gap_links`
- `source_requirement_links`
- `source_gap_links`
- `source_notes`
- `source_assets`
- `source_annotations`
- `source_annotation_gap_links`
- `source_annotation_requirement_links`
- `source_export_events`

All Stage 2 rows remain project-scoped and owner-isolated by RLS. Cross-Investigation
relationships use composite foreign keys where applicable so an application bug cannot
silently connect records from two Investigations.

## Epistemic boundary

Stage 2 records collection activity. It does **not** decide:

- whether a Source is reliable;
- whether an information claim is credible;
- whether two Sources independently corroborate each other;
- whether attribution is correct;
- whether an Information Gap is resolved;
- whether a hypothesis is true.

Legacy Source reliability/verification fields remain in the historical Source Registry
for compatibility, but the Stage 2 collection UI does not use them to drive Collection
judgements. Source and information evaluation belongs to Stage 4.

## Stage 3 boundary

Stage 2 does not extract or promote:

- IOCs;
- TTPs;
- CVEs;
- entities;
- timeline events;
- claims/evidence propositions.

Those operations begin in Stage 3 Processing. The Source Reader is designed so future
Processing actions can start from a Source or annotation without changing the Stage 2
collection semantics.

## BAYKUSH Intelligence Node boundary

The BAYKUSH Intelligence Node remains the centralized public-source collection,
normalization, coverage and measurement substrate. Its established architecture
preserves immutable raw/canonical evidence and explicitly separates collection and
normalization.

Stage 2 CİTEM is the analyst-directed workspace that answers *why this material is
needed for this Investigation*. Node search, automated monitoring and Collection Log
capabilities are intentionally deferred from the Stage 2 v1 surface.

## Validation

Stage 2 includes:

- Zod unit tests for Collection Requirements, Source ingestion and normalized annotation
  geometry;
- an isolated PostgreSQL 16 migration acceptance test;
- same-Investigation foreign-key tests;
- owner RLS isolation tests;
- private Source Storage policy/bucket checks;
- integration into the repository validation workflow.

The intended acceptance scenario is the APT28 Investigation:

```text
Information Gap
  ↓
Collection Requirement
  ↓
official / vendor / technical Source
  ↓
collection rationale
  ↓
analyst note / annotation
  ↓
branded working packet
```
