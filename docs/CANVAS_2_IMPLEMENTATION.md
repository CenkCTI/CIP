# CANVAS-2 — Canonical Investigation Entity References

**Dependency:** CANVAS-1 PR #88. This is a stacked feature branch and PR #89 targets
`feat/canvas-1-core-workspace` while #88 remains open. Do not merge CANVAS-2 independently.

## Delivered
- Search canonical records from the existing Fusion Inventory, not an AI-generated or duplicated record set.
- 18 typed families: SOURCE, SOURCE_ASSET, SOURCE_NOTE, ANNOTATION,
  SOURCE_CLAIM, ATTRIBUTION_CLAIM, RESEARCH_NOTE, EVIDENCE, TIMELINE_EVENT,
  ACTOR, CAMPAIGN, INDICATOR, MALWARE, CVE, MITRE, COUNTRY_NOTE,
  INFORMATION_GAP, COLLECTION_REQUIREMENT.
- Drop free-form NOTE cards and typed ENTITY_REF cards onto the same XYFlow workspace.
  Entity cards preserve geometry and note/card undo/redo through the CANVAS-1 history.
- Live title/summary fetched from owner-scoped Fusion Inventory. Display data are not
  persisted to the Canvas DB. Cards link back to existing canonical detail routes,
  including Source Reader annotation focus and focused Fusion Inventory attribution.
- Missing/deleted/inaccessible records show explicit unresolved placeholders; source
  text is never silently reused as verified intelligence.
- Manual Refresh linked records re-reads canonical records and updates their previews.

## Database and security
Migration: `supabase/migrations/202611050078_canvas_2_entity_refs.sql`.
It adds `record_type` and `record_id` to existing Canvas items and modifies the
existing `save_analysis_canvas_v1` RPC **without changing its signature**.

A new ENTITY_REF must match a real `fusion_inventory_base` tuple of the board's
own Investigation. Previously validated references can remain on the board when
a source is deleted, but cannot introduce references to a different Investigation.
The `kind` CHECK constraint prevents entity cards from storing copied source text.

The security-definer RPC uses an empty search path, explicit auth.uid() and
project ownership checks; public/anon execute privileges remain revoked.
The owner-scoped search/resolve API reads `fusion_inventory_items` using the
existing user Supabase session; the view uses security_invoker and owner RLS.
Entity search is title-only for now, with IOC punctuation preserved.

The only data stored in an ENTITY_REF row are: kind, record type/UUID, empty
content, geometry and item metadata. No provider credentials, files, PDF pages,
signed Storage URLs or source previews are copied into Canvas persistence.

## API
- `GET /api/projects/[id]/canvases/entities?q=&type=&page=1` — 20 records per page,
  project authorization, strict filters, private no-store response.
- `POST /api/projects/[id]/canvases/entities` — up to 100 typed references
  per request; returns exact resolved/missing entries, with project authorization.
- Existing canvas mutation API supports notes and references in an atomic revisioned
  snapshot. It maps unavailable/invalid canonical refs to HTTP 400.

## Acceptance
GitHub Actions `CANVAS-2 validation` runs:
- `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- Disposable PostgreSQL 16: CANVAS-1 then CANVAS-2 migrations;
  valid mixed save, idempotent replay, rejected cross-Investigation/source
  references, rejected invented source content, stale revision conflict, orphan preservation.
- Unit tests for 18-type registry, bounded source projection, reference schema,
  existing note compatibility, and accessible entity picker.

## Manual browser acceptance (not yet claimed)
1. On a staging environment with both migrations, create a blank board and
   add one existing Source, Annotation, Source Claim, IOC and working note.
2. Move, resize, delete, undo and redo; refresh and verify all positions persist.
3. Update a canonical record, click Refresh linked records, and verify the card
   preview changes without modifying the original.
4. Delete a linked source and reload: the card should show a missing placeholder
   with the source ID, never a stale preview presented as live intelligence.
5. Test a second user and a foreign Investigation; ensure no search/result leakage
   or cross-Investigation reference can be saved.
6. Verify source annotation navigation opens the correct Source Reader highlight;
   the Attribution Claim link opens the specific Fusion Inventory inspector.
7. Verify original Knowledge Graph, Notes, Source Reader, Fusion Inventory and
   existing CANVAS-1 note-only boards remain functional.

## Not in CANVAS-2
Free-form relationships and connectors, grouping, PDF embedding, image/file
previews, real-time collaboration, automatic AI attribution or source verification.
Those are future CANVAS-3/4/5 work.

**Deployment note:** A schema migration alone does not release Canvas UI. Do not
apply this additive migration to live Supabase until the staged feature chain and
release sequence are reviewed.
