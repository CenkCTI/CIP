# CİTEM AI Phase A1 — PDF extraction-quality baseline

Scope: additive diagnostic module and operator-run 23-page ANSSI PDF.js fixture only.
This is **not the full Phase A release gate**. No production schema changes or
automatic downloads. The authoritative original PDF is unchanged.

## Usage

Install dependencies using the existing lockfile; download the **official**
CERTFR-2023-CTI-009 PDF manually and use the local file path:

```bash
npm ci
node --experimental-strip-types scripts/citem-anssi-pdf-baseline.mjs /path/to/CERTFR-2023-CTI-009.pdf
npx vitest run tests/citem-document-quality.test.ts
```

Report is JSON: PDF SHA-256, actual pdfjs-dist version, page count, per-page
character counts, section-type guesses, extraction fingerprint, chunk count,
page coverage, quote presence, and search-alias diagnostic. It logs no complete
document pages, secrets, user data, or raw snippets. Full PDF is **never
committed to the repository**. Failed gold checks return nonzero exit.

Quality flags: NO_TEXT, LOW_TEXT_COVERAGE, REPLACEMENT_GLYPHS,
CONTROL_CHARACTERS, PAGE_SEQUENCE_INVALID. French ligatures, dehyphenation and
diacritics are normalized in **search alias only**, never in the original text.
A language hint is low-confidence/unverified, not source metadata.

**Not run in this environment:** local official PDF extraction (network/PDF
artifact unavailable), live application database retrieval, browser/NVIDIA
analysis. CI can validate pure quality helpers, not the real 23-page fixture.

## Remaining Phase A gates

- Versioned source/document manifest in owner-scoped schema with migrations.
- Immutable per-page extraction snapshots and section-aware provenance.
- Revision/quality attribution and safe navigation to the correct original PDF.
- PostgreSQL and browser acceptance with real ANSSI PDF and negative RLS tests.
- No READY without complete validated evidence; existing PR #83 migration 067
  provides atomic page/chunk publication, but not this planned manifest.
