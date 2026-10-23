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

## Blocking ANSSI glyph-integrity finding (2026-10-23)

CITEM indexed the official ANSSI report as 23 pages / 46 chunks, but the
PDF.js extraction yielded Unicode private-use glyphs in the font text.
Page 4 visually says **mars 2022**, yet its stored text replaces digits
with private glyphs. This allowed the AI to answer **mars 2023**.
Page-completeness and SHA-256 validation cannot catch this semantic defect.

This baseline now flags PRIVATE_USE_GLYPHS and refuses to pass its ANSSI
golden checks unless page 4 actor/CVE/start/end date and page 15-17 R10-R13
recommendation identifiers appear verbatim without guessing. JSON report
includes privateUseCount per page. The immutable original PDF is unchanged.

### Remediation (requires separate implementation and live PDF verification)

1. Inspect the affected PDF font's encoding and /ToUnicode CMap.
2. Compare PDF.js with a second local engine such as Poppler pdftotext.
   Where needed, test local OCR against the rendered original page.
3. Record recovered Unicode text in a separately attributable extraction
   snapshot with source/engine/version and page provenance. Never replace
   private characters by a guessed global substitution map.
4. Require exact checks on 3/4/15/16/17 plus verified dates/identifiers,
   and independently inspect quotes. Only then wire the reliable extraction
   into the server and atomically rebuild the derived index from the
   same original document SHA. Do not modify original Storage PDF files.
5. Re-run the real-model and browser retrieval tests before merge.

The diagnostic changes here do NOT repair Unicode extraction themselves and
must not be treated as an end-to-end acceptance pass.

### Independent local Poppler comparison

On a Linux workstation with poppler-utils installed, run:

```bash
node scripts/citem-anssi-compare-extractors.mjs /path/to/CERTFR-2023-CTI-009.pdf
```

The check reads the same exact local original and outputs only SHA, Boolean
gold checks and private-use counts for pages 1/3/4/15/16/17, not raw PDF
content. A passing result identifies a candidate alternative extraction engine;
it does NOT authorize silently switching production extraction, trusting
all untested pages, or changing the original/derived database records.
Follow with cross-page visual and citation tests before deployment.

## Phase A2: optional local independent PDF text recovery

PR #84 now contains \`pdf-recovery.ts\` and \`pdf-poppler.ts\`.
\`extractPdfPages\` keeps the authoritative PDF bytes intact while PDF.js
parses a copy. If PDF.js yields Unicode private-use or replacement glyphs,
the server can optionally run locally installed \`pdftotext\` against the
*same immutable source PDF*. Enable this only in a controlled server runtime:

\`\`\`bash
sudo apt install poppler-utils
CITEM_PDF_POPPLER_ENABLED=1 npm run dev
\`\`\`

No shell is invoked: the executable and argv are fixed, timeout/buffer are
bounded, and temporary files are removed. No PDF or text is sent over the
network to another provider. The page-level recovery arbiter replaces
only damaged pages if alternate text is nonempty, no longer corrupted, has
matching page provenance, and passes size sanity checks. If no valid
alternate exists, the original, visibly flagged extraction is retained.

**Not an unconditional production fix.** Vercel may not provide the Poppler
binary. This step requires a runtime where \`pdftotext\` is installed.
The official ANSSI source has not yet been tested through this exact path.
Its old READY-derived indexes still contain corrupted glyphs. Do not
silently replace them using source-model guesses or an SQL bulk update.
A further review gate must add *extractor-versioned atomic reindexing*
before this can be accepted as a live repair.


## Actual Firefox/Cairo reprinted ANSSI PDF reproduction (2026-10-23)

A user-provided copy of the public ANSSI 23-page APT28 report was
investigated offline. **Do not commit the uploaded document or transmit it
to CI.** Local specimen (name intentionally omitted): 943,550 bytes,
SHA-256 `720fd20512cf88f02492f0c8dcc0f21ead2e48832586105bb95a2c82b1a6bcb0`.
Metadata: `Creator: Mozilla Firefox 153.0`,
`Producer: cairo 1.18.4`.

This specimen is NOT byte-equal to either earlier stored source asset
(934,356 / 934,357 bytes), despite exhibiting the same defect class.
The independent publicly downloaded ANSSI PDF (2,487,153 bytes,
SHA-256 `08b62bfd...`) is correctly parsed by both text engines.

On the reprinted specimen:
- PDF visible page 4 says `CVE-2023-23397`, from `mars 2022`
  through `juin 2023`. Visual rendering confirms this.
- Poppler UTF-8 `pdftotext` returns 181 BMP private-use characters
  on page 4, including altered CVE digits and dates.
- PyMuPDF returns the same corrupt Unicode mappings.
- Tesseract French OCR of a 200–240 DPI rasterized page 4 returns the
  correct CVE and dates, with zero private-use glyphs.
- Rasterized OCR of pages 15–17 correctly recovers the recommendation
  prose; side-margin R10–R13 labels were omitted under PSM 3. Since
  the intact literal labels remain in the PDF source text layer, the
  OCR arbiter preserves those exact page labels without guessing.
- `src/lib/ai/stage3/pdf-ocr.ts` now enables opt-in *local*
  `pdftoppm + tesseract -l fra` recovery from immutable original PDF
  bytes (strict time and size caps; no cloud OCR, no shell injection,
  temporary data deleted). Default remains disabled.
- An independent GitHub test synthesizes a PDF whose visible text is
  correct but its ToUnicode CMap maps digits into private-use glyphs.
  Poppler fails intentionally and the actual CITEM `extractPdfPages`
  OCR fallback must recover CVE/date/identifiers; no user file or font
  file is checked into the repo.

**Not production-accepted yet.** The Vercel serverless runtime must not
be assumed to have Tesseract or its French language pack. Optical
character recognition is potentially imperfect and needs quality
provenance flags and appropriate quote caution. Stored READY indexes
are still keyed only by original SHA, not extraction quality/version;
their old incorrect content is untouched. Versioned atomic reindex and
a deployment-grade OCR worker/runtime acceptance remain blocking.
