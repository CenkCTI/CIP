# CİTEM Evidence Focus — architecture & five-second HUD specification

## Baseline, delivery and dependency

- Feature branch `feat/ui-evidence-focus-hud`, independent PR **stacked on** Phase 6 (`feat/ai-phase6-claim-centric-corroboration`) so PDF Stage 3, Phase 5 WEB_001 and Phase 6 claim comparisons can all receive the same focus behavior.
- Merge sequence: accept/merge Phase 6 PR #78, then retarget/rebase this PR onto main. Do not merge a child PR while parent is an unreviewed draft.
- All operations are client-side, ephemeral and presentation-only. No database schema or server API changes. No new network calls, no source edits, no local storage of citations.

## Architecture & data flow

```text
Verified PDF source citation (quote + page + token + annotation ID)
  -> ProcessingCopilot / CopilotChat / Candidates / Document review / Phase 6
  -> onNavigate(page, annotationId?, quote?) in ReaderWorkspace
  -> { page, nonce++, quote, sourceToken? } -> PdfSourceViewer.jumpToPage
  -> page virtualization makes target near -> PDF.js canvas/text layer renders
  -> locatePdfEvidence(textLayer, quote) -> native DOM Range
  -> range.getClientRects() -> page-relative overlay rects
  -> scroll matched text into view + animate HUD for exactly 5000ms
  -> clear overlay, leaving the existing PDF layer and annotations untouched

Phase 5 / Phase 6 external source lead or verified WEB excerpt
  -> CİTEM's own rendered result/evidence card (not an external tab)
  -> EvidenceTextFocus displays original text, focuses it on user action
  -> 5-second HUD emphasis; no claim about independence or corroboration
```

## PDF text targeting

1. Match a **user-selected citation** with server-verified page and exact excerpt from the existing AI response; never trust search snippets as PDF provenance.
2. Use the current PDF.js **text layer**, not a new PDF renderer, browser native find, or OCR. Collect DOM text nodes and character offsets, normalizing NFKC, case and whitespace.
3. First use a **unique exact normalized match** across nodes/spans. If not found, use a **unique, alphanumeric-only, whitespace-insensitive** match to accommodate PDF.js span boundaries. Require at least 16 alphanumeric characters; ambiguous and absent matches fail closed to page-only navigation with a visible explanation.
4. Create a DOM Range and convert its client rectangles to page-relative overlay geometry. Clamp bounds, skip zero-size rectangles, dedupe, cap at 32 rects.
5. Do not use `innerHTML`, substring injection, manual span replacement or `window.getSelection`; don't break user selection, annotation creation or existing PDF geometry.
6. Wait for PDF.js text-layer completion; a page jump is not evidence that text layer is ready. Recompute after zoom/render/virtualization if necessary. On repeated clicks, increment a nonce to restart the animation.
7. Never claim a PDF citation is visually located if exact (or unique normalized) matching fails. Keep page jump functional and show nonblocking status instead.

## Web evidence design / trust boundary

- Phase 5 Brave results are **leads**. Provide Focus search excerpt for their displayed snippets with the same five-second visual treatment, explicitly without presenting them as verified source evidence.
- Phase 5 Read with AI uses CİTEM-displayed **verified WEB quote** text and provenance. Focus in that in-app card, retain external URL link.
- Phase 6 compares PDF and WEB results. Focus both the original PDF exact quote and individual verified WEB excerpts. If a direct quote is absent, **contextExcerpt** remains visibly marked *not corroboration*.
- A normal cross-origin external website cannot be modified, highlighted or searched by CİTEM code. Never pretend to navigate to a particular sentence in a third-party tab. A separately permissioned and secure reader-view service would be another PR.

## Visual timeline: exactly 5000 ms

- 0–600ms: gentle appearance / corner brackets signal acquisition.
- 600–1600ms: horizontal amber-to-muted-green underline reveals left-to-right.
- 1600–3400ms: restrained luminous hold, no strobe.
- 3400–5000ms: continuous, progressive fade to full transparency.
- On completion, remove transient layer entirely (no permanent highlight).
- Default palette uses CİTEM amber + low-intensity military green, pointer-events:none and z-index above PDF canvas/text but not annotation/editor controls.
- `prefers-reduced-motion`: no scanning/sweeping; use static indication that fades at the five-second mark, preserving the same duration.
- Web accessibility: explicit native keyboard-activatable button with concise focus label; text remains readable and source-type labels stay unchanged. No flashing effects.

## Security, privacy & performance

- Cap client quote length at 1400 characters, candidate evidence rectangles at 32.
- Only the current mounted PDF page text layer is inspected; no background model call or network request.
- Clean timeouts on new focus, zoom or unmount, and discard highlights when their source/asset/page changes.
- Existing manual annotation positions and semantics remain immutable.
- No persistence of ephemeral focus requests or web excerpt text in browser storage.

## Test acceptance

1. Click a verified DOC_P011_C01 quote in Copilot: page 11 opens, matching words are centered and focused; exactly five seconds later overlay is absent.
2. Same citation twice: separate nonce, full five-second restart.
3. PDF.js delayed render and offscreen page: attempt locating only after text layer is rendered.
4. Fragmented spans: matching across multiple text nodes; missing quote, short, ambiguous or unrendered layers: page-only fallback and explanation.
5. Zoom/pan and rotated pages: rectangles recomputed from DOM Range; no geometry saved.
6. Phase 5 lead: highlight visible snippet in CİTEM, retain lead/not-evidence label.
7. Phase 5 WEB_001 and Phase 6 WEB row: focus verified quote in CİTEM, never third-party DOM. A context excerpt stays not corroboration.
8. Reduced motion, repeated clicks, timer cleanup, keyboard-only activation, no overlay interception of mouse selection.
9. CI: ESLint, TypeScript, Vitest, Next production build, Vercel Preview; manual PDF/browser animation smoke across real source files.

## Rejected alternatives

- DOM `<mark>` replacement: mutates PDF.js text layer and corrupts selection/annotation.
- Blind fuzzy nearest-text selection: can highlight an unrelated sentence with falsely elevated confidence.
- Loading third-party sites into a same-origin iframe: CSP, X-Frame-Options and origin-security issues; cannot reliably target text.
- Canvas bitmap highlight: brittle under zoom, PDF text selection and native geometry changes.


## Delivery / release strategy (ADR-EF-001)

The initial PR is temporarily tested against `main` to activate workflows that
trigger on pull requests into `main`. This CI-only retarget exposes Phase 6
parent commits in the PR diff; after successful validation, restore the
feature-branch base `feat/ai-phase6-claim-centric-corroboration`. The resulting
stacked PR remains independently reviewable. CI verifies the feature commit
but does not replace in-browser manual acceptance on actual PDFs.
