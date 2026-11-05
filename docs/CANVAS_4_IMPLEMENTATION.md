# CANVAS-4 — Private Source Asset PDF and Image Previews

Stacked PR #91 is based on CANVAS-3 PR #90 (CANVAS-1/2 already merged).
Feature code and Supabase SQL migration should be rolled out in the normal release sequence.

## Workflow
- Add existing `SOURCE_ASSET` records to Canvas using **+ Source file preview**.
- `ENTITY_REF` with `record_type=SOURCE_ASSET` and `preview_page` defines a media card.
- The media renderer retrieves canonical metadata via an owner-scoped route, requests a **five-minute signed URL** from the existing private `source-assets` bucket, and displays one PDF page (via PDF.js) or a safe PNG/JPEG/WebP preview.
- Navigate PDF pages through Previous / Next and persist the selected page in the revisioned Canvas scene. Links, frame groups, editor notes and Undo/Redo continue working.
- **Open source** goes to the original Investigation Source Reader. The source is never copied or modified.
- Unavailable/deleted files show a placeholder; unsupported, too-large or potentially active file types do not render inline. Instead the original source remains accessible.
- **Refresh preview** mints a new short-lived signed URL when needed. No signed URL, Storage path or file bytes are ever written to the Canvas database.
- The existing Canvas entity browser still supports all 18 canonical CTI families.

## Security design
- `POST /api/projects/[id]/canvases/media`: project UUID and up to 30 asset UUIDs, owner authorization, and project-scoped query for READY/ORIGINAL files only. The route does **not** accept arbitrary paths or URLs.
- Strict, explicit MIME allowlist: PDF, JPEG, PNG, WebP. Never render SVG, HTML, executable files or DOCX directly inside Canvas.
- 80 MiB inline-preview size cap (large documents remain in the Source Reader).
- `Cache-Control: private, no-store, max-age=0` and `X-Content-Type-Options: nosniff`.
- Supabase private signed Storage URLs have 300s TTL and are only held in component state. The Source Reader continues to own annotation/edit workflows.
- DB schema: `analysis_canvas_items.preview_page` nullable integer 1–10,000 with a CHECK limiting usage to `ENTITY_REF/SOURCE_ASSET`.
- Atomic `save_analysis_canvas_v3` takes the whole scene, retaining C3 ownership, record identity, graph integrity, request-id replay and revision rules. An older CANVAS-1/2/3 browser will be refused if an existing preview could be overwritten.
- No new Storage bucket, background extraction, content embedding, RAG ingestion, external iframe, AI attribution or Knowledge Graph mutation.

## CI and validation
`CANVAS-4 validation` workflow runs lint, TypeScript, all Vitest tests, Next production build and disposable PostgreSQL acceptance. SQL fixture composes CANVAS-1→CANVAS-4 and tests valid media page, cross-Investigation rejection, forbidden page on NOTE, oversized page, old-browser conflict, zero document duplication and deleted source preservation.

### Manual browser acceptance
1. In staging with all four migrations, add a real READY/ORIGINAL PNG/JPEG and PDF from Source Registry to an existing Canvas.
2. Change the PDF page, wait for Saved, reload and confirm the selected page is maintained. Compare with original Source Reader.
3. Add an analyst link between a media card and a note; group both in a Frame, move, undo, redo and reload.
4. Try an unsupported DOCX/HTML/SVG; confirm it is **not** executed or embedded and links back to the Source Reader.
5. Revoke/delete the source asset; refresh the Canvas and confirm the media card persists as unavailable, without displaying any stale signed URL.
6. Try two users and cross-Investigation source assets; inspect browser network responses for no-store and no unauthorized resource data.
7. Keep Canvas open beyond five minutes and refresh preview to get a newly signed private URL. Verify expiry and error fallbacks.
8. Test a large (over 80 MiB) file and a multi-hundred-page PDF for safe fallback and reasonable performance.

Automated acceptance does not establish human visual/browser QA.
