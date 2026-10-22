# CİTEM PDF report export appearance

Report PDF exports now support **Orijinal**, **Koyu Yeşil**, and
**Gece Siyahı**, in all three report flows: live working draft, immutable
version snapshot, and authoritative published version. HTML and Markdown
exports are unchanged.

In the Downloads panel and next to version/authoritative export links, the
user selects an appearance and downloads a PDF. The selection is stored as
a browser preference under `citem:report-pdf-appearance:v1` (not part of the
report content or publication). Initial default: **Orijinal**.

The export endpoint accepts a validated, optional query parameter:

- `?appearance=original` — existing branded report design unchanged.
- `?appearance=forest` — page `#182B25`, text `#E6EEE9`.
- `?appearance=night` — page `#151719`, text `#E3E6E8`.

Parameters compose with `versionId=...` or `scope=authoritative`. Invalid
appearance values receive 400, and omitted values use Original to preserve
backwards compatibility.

## Rendering and security

Dark themes are **embedded as true PDF fills / text colors** at the
`@react-pdf/renderer` authoring stage; they are not a browser filter, do not
flatten all text to images, and survive downloading, forwarding, and opening
in other PDF readers. Semantic colors also cover headings, links, tables,
assessment boxes, header/footer and references; the amber CİTEM branding
remains. No database migrations or source transformations.

Immutable report version content, timestamps, attribution disclaimer and
reference appendix are not modified by appearance selection. Markdown/HTML
outputs remain the same.

## Acceptance

- Download original, forest and night PDFs; check **every** body page has the
  right dark page fill and light typography, not merely the cover page.
- Confirm headings, long paragraphs, tables, code/quotes, source links,
  versioned assessments and appendices retain layout and readable contrast.
- Export a saved/authoritative version and compare content to Original.
- Verify downloaded PDFs remain searchable/selectable, A4, and open normally.
- Confirm selecting appearance does not modify autosave draft or published
  report version metadata.
