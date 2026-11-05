# CANVAS-1 — Core Analysis Canvas

## Scope
An Investigation may contain zero or more independently named, empty-by-default Canvas workspaces.
CANVAS-1 implements free working notes, pan/zoom, drag, resize, selection/removal,
undo/redo, owner-scoped persistence and visible save states. It does NOT implement entity
references, edges, provenance navigation, PDF viewers or other future CANVAS phases.

## Architectural boundaries
- Canonical Investigation records and Knowledge Graph remain authoritative and untouched.
- The new analysis_canvases, analysis_canvas_items and analysis_canvas_mutations tables
  are independent of graph_node_positions and entity_relationships.
- Notes are working material, NOT evidence or established intelligence claims.
- Canvas mutations use a single PostgreSQL RPC transaction with a locked board revision.
  A request_id receipt makes a successful-but-unacknowledged save safe to replay.
- Stale base_revision receives EDIT_CONFLICT (HTTP 409). The UI preserves its draft
  in memory and warns against refreshing; it never overwrites newer remote data.
- New public-schema tables have owner-scoped RLS. No direct client insert/update/delete
  grants exist on canvas items or mutation receipts. The definer RPC independently
  checks authenticated uid, board ownership and Investigation ownership.
- 500-note hard limit, 8000 characters/note, bounded geometry and payload size.
- No Supabase migration is applied by this PR itself; apply the migration in the
  target environment before exposing Canvas to end users.

## Paths
- `/projects/[id]/canvas` — list and create independent empty boards
- `/projects/[id]/canvas/[canvasId]` — interactive workspace
- `/api/projects/[id]/canvases` — list/create
- `/api/projects/[id]/canvases/[canvasId]` — read/rename/delete
- `/api/projects/[id]/canvases/[canvasId]/mutations` — atomic revisioned save

## Automated acceptance
- `npm run lint`
- `npm run typecheck`
- `npm test` — includes CANVAS-1 contract/history/directory tests and existing regressions
- `npm run build`
- `psql -v ON_ERROR_STOP=1 -f scripts/test-canvas1-migration.sql` in disposable PostgreSQL 16:
  empty initial board, valid save, idempotent replay, optimistic conflict,
  empty snapshot, denial of direct item writes, denial of cross-Investigation writes.

## Manual browser checklist (staging with applied migration)
1. Create two boards; both initially contain zero notes.
2. Add notes; type continuously and pause; verify Saved without needing blur.
3. Pan/zoom, drag a note, resize it, undo and redo both placement and content.
4. Refresh; verify note content, positions and dimensions persist.
5. Delete one board; verify the other board and all original Investigation data remain intact.
6. Open one board in two tabs, edit and save in A, then edit in B; verify 409
   and no silent overwrite. Copy unsaved B notes before reloading.
7. Verify an unrelated user cannot list, read, edit or delete these boards.
8. Confirm existing Knowledge Graph and Source Reader still behave as before.

## Known limitations
- Early version is single owner, single writer at a time; no realtime collaboration.
- Conflict resolution is manual; no automatic three-way merge.
- Note typing is committed on idle/blur, and canonical board autosave is debounced.
- Cross-investigation entities and persisted connections are out of scope.
- No manual browser acceptance is claimed until a staging deployment is tested.
