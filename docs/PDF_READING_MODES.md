# CİTEM — Native PDF Reading Modes

The Source Reader has exactly **Orijinal**, **Koyu Yeşil**, and
**Gece Siyahı**. Original is the initial mode. The last selection persists in
browser localStorage under `citem:pdf-reading-mode:v1`.

| Mode | Reader background | Reader foreground |
| --- | --- | --- |
| Orijinal | Original PDF | Original PDF |
| Koyu Yeşil | `#182b25` | `#e6eee9` |
| Gece Siyahı | `#151719` | `#e3e6e8` |

## Render architecture and source fidelity

CİTEM lets PDF.js draw the original source page normally, retaining PDF
selection/search, exact page coordinates and annotations. The appearance mode
transforms **only the in-browser canvas pixels**, never the source document.

To preserve visual art while retaining legible text:

1. Request PDF.js `recordOperations:true` and the corresponding operator
   list. Image, image mask and shading boundaries are identified via its
   normalized (0–1) canvas coordinates, then converted to canvas pixels.
2. Preserve all pixels inside **raster artwork** regions exactly, including
   white pixels, captions embedded into images, and chart cells.
3. The PDF.js text layer is transparent but provides accurate client
   rectangles for native text spans. Those rectangles (including hyperlinked
   text) are turned into a text coverage mask. In that mask, use luminance
   mapping even for colored source glyphs, eliminating cyan/orange subpixel
   fringe effects and unreadable dark-blue links.
4. Outside text and raster masks, white/neutral source background becomes the
   dark page color and neutral lines become accessible light tones.
   Source-colored vector illustration pixels are kept when distinguishable
   from neutrals, rather than preserving a whole vector bounding rectangle,
   which previously left white stripes/boxes on table-of-contents pages.
5. When the page is scanned, predominantly a full-page bitmap, too large, or
   its actual image bounds cannot be established, **fail closed** to Original
   with a visible label. A pure text/vector page does *not* require bitmap
   bounds and must not fall back merely because recorded box data is absent.

## Trade-offs and exactness

Hyperlink text colors can change for accessibility. Source-colored vector
illustrations retain their pigments if sufficiently chromatic; neutral vector
drawing colors may be contrast-adjusted. Large image rectangles are protected,
which may also preserve native text laid over them; full-page scans remain
original. This is a conservative display transformation rather than a
content-aware, lossless reauthoring of every PDF graphic primitive.

There are no database migrations, external requests, annotation changes or
changes to private PDF source / exported PDF bytes.

## Regression / manual acceptance

- NIST CSF 2.0 sample: the front-matter page, acknowledgements, table of
  contents, section body and footnotes should all darken if text/vector-based.
- Hyperlink ink and background strips must remain readable on dark mode.
- White rectangles and other non-raster vector paths must not generate
  untouched white strips around list headings and table rows.
- A PDF with a heatmap/photo must preserve image-region RGB.
- Confirm zoom, underlining/annotation save and selection, navigation across
  multiple pages, scroll restoration and AI evidence focus preserve the
  preferred mode. If a source is renewed after annotation save, verify the
  page re-renders in the saved preference.
- Full-page scans with uncertain images may display Original plus a notice.
