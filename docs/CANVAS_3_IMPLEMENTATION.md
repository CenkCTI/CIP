# CANVAS-3 — Analyst Relationships and Organization

Stacked feature PR #90, based on CANVAS-2 PR #89. CANVAS-1 PR #88 has merged to main. The SQL migration in this PR is **not** automatically applied to Supabase; applying it is a separate release step.

## Analyst workflow

A new Canvas remains completely empty. Nothing is created until the analyst adds a note, existing Investigation record, or groups selected cards.

- Drag from the **right connection handle** of a note or reference card to the **left connection handle** of another card to create an analyst edge.
- Click the edge to edit its type and an optional rationale (maximum 500 characters).
- Edge semantics: `RELATED_TO`, `SUPPORTS`, `CONTRADICTS`, `DERIVED_FROM`, `INVESTIGATE`.
- No relationship is recorded as fact, evidence corroboration, provenance, attribution, or Knowledge Graph link.
- Drag-select or Shift-select two or more ungrouped cards; click **Group selected** to create a single-level FRAME.
- Move/resize the entire frame; children store frame-relative coordinates.
- Select a frame to rename or **Ungroup**. Removing a frame releases its contents without deleting any canonical records or their analyst edges.
- Shift-select cards and align to a common coordinate space; move selected cards between visual z-layers.
- Notes, entity references, frames and analyst edges participate in one bounded Undo/Redo history and autosaved board revision.
- Middle-button drag pans; Flow controls provide zoom/fit, and the toolbar includes Reset view.

No nested frames, canonical graph rewrites, rich-file embedding or AI-generated relationships are in scope.

## State, compatibility, security

Migration: `supabase/migrations/202611050079_canvas_3_relationships_frames.sql`.

- `analysis_canvas_items.group_id` references a parent FRAME **on the same Canvas** through a deferrable composite foreign key. Single-level frames are validated in the v2 RPC and TypeScript Zod schema; canonical source records remain separate.
- `analysis_canvas_edges` has project/canvas scoped composite foreign keys for both endpoints. Direct INSERT/UPDATE/DELETE to `authenticated` and all `anon` access are revoked. Owner RLS allows SELECT.
- `save_analysis_canvas_v2(p_project_id,p_canvas_id,p_base_revision,p_request_id,p_items,p_edges)` atomically replaces the snapshot under a row lock, enforces owner and source reference checks, bounds 500 nodes/1000 edges, rejects dangling references, and computes a full-scene SHA256 idempotency receipt.
- The existing `save_analysis_canvas_v1` is guarded: a stale CANVAS-1/2 browser cannot write a note-only payload over a board that already contains frames, grouped children or edges. It raises EDIT_CONFLICT without changing any content.
- The app validates the exact scene before invoking privileged RPCs. Legacy ungrouped note/reference saves remain compatible.
- All cards remain presentation-only; an unavailable/deleted source remains unresolved instead of being copied into a forged entity. Edges have explicitly **analyst** semantics.

## Tests

GitHub workflow: `.github/workflows/canvas-3-validation.yml`.

- `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- Disposable PostgreSQL 16 acceptance loads migrations CANVAS-1, CANVAS-2 and CANVAS-3, proving an atomic frame+edge save, safe replay, invalid endpoint rejection, bad group rejection, RLS isolation, same-board idempotency, old tab conflict, and frame removal without relationship deletion.
- Unit tests validate frame geometry, group/ungroup, pure history, alignment, invalid links, provenance immutability, typed scene validation and compatibility.

## Manual browser QA required before deployment is considered validated

1. Apply CANVAS-1→CANVAS-3 migrations to a staging database (not production) and deploy the stacked branch.
2. Create a blank board; add NOTE/ENTITY_REF; make two relationships; change rationale and semantics.
3. Reload and verify layout and both edges persist and that linked canonical record previews resolve.
4. Multi-select two cards, group, drag/resize the frame, rename, reload; verify children remain frame-relative.
5. Ungroup/undo/redo and remove frame; verify children/edges are preserved without altering Sources, Claims or Knowledge Graph.
6. Open another tab with an older version and attempt to edit a scene with edges; verify EDIT_CONFLICT rather than data loss.
7. Confirm a second user cannot load or save the board or any frame/edge across Investigations.
8. Test 300–500 mixed nodes and hundreds of links in a staging browser for animation/interaction performance and focus/keyboard behavior.

CI validates code/schema, **not** the actual browser experience, latency, accessibility or staging permissions.
