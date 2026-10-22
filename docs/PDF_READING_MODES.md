# CİTEM — PDF Reading Modes (mixed-content aware)

The native Source Reader offers exactly **Orijinal**, **Koyu Yeşil**, and
**Gece Siyahı**. Default: Original. Browser preference:
`citem:pdf-reading-mode:v1` (localStorage).

| Mode | Neutral white canvas background | Neutral black text |
| --- | --- | --- |
| Orijinal | original | original |
| Koyu Yeşil | `#182b25` | `#e6eee9` |
| Gece Siyahı | `#151719` | `#e3e6e8` |

## How the PDF is rendered

- Use the normal PDF.js renderer to draw each page *unchanged*.
- With `recordOperations:true`, collect PDF.js drawing bounds for raster
  pictures, image masks, charts and vector artwork.
- Match the bounds to the PDF.js operator list. If the list cannot be verified,
  preserve the **entire original page** instead of guessing.
- Read canvas pixels **only in the user's browser**. Recolor **all**
  pixels outside protected artwork bounds through a single grayscale luminance
  mapping: white -> selected dark background, black -> readable light foreground,
  intermediate tones blended. This also removes blue/orange LCD/subpixel
  antialiasing artifacts that otherwise appear as ghosted letter outlines.
  Source-colored vector regions are protected by PDF.js artwork bounds.
- Preserve the original RGB of every pixel inside protected artwork rectangles,
  including white portions of charts and pale heatmap cells.
- Extremely large pages, all-image scans, unsafe operator lists, uninspectable
  canvas data and excessive artwork complexity remain Original with a visible
  explanation. Full-page white vector background fills may be skipped to let
  normal PDF text/background darken.

**Limitations:** Source-colored text **outside** protected graphics is
recolored to a readable neutral monochrome; hyperlinks may lose their
original blue tint. Rasterized text inside a protected image retains the
source colors, and bounding rectangles may preserve overlapping text.
Artwork preservation is conservative and is not perfect object segmentation.

## Source integrity

No PDF bytes, private Storage assets, annotation fragments, PDF coordinates,
source citations, AI-derived evidence or annotated exports are altered.
The PDF.js text layer remains intact, preserving selection, search and the
five-second Evidence Focus HUD. No server-side processing or migration.

## Browser acceptance before merging

1. Open a text-only PDF; change Original -> Green -> Night, zoom, select
   passages, and verify colors and text fidelity.
2. Open a PDF with inline graphs and photographs (e.g. Storm-0558 report);
   ensure the *surrounding page and text* turn dark and the heatmap/photo RGB
   stays exactly the same within image bounds.
3. Open a fully scanned page and a full-page photo. They should remain Original
   and show a non-blocking appearance fallback label.
4. Check multi-page PDFs, rotation, intermittent pages, virtualized renders,
   annotation overlays and AI citation navigation.
5. Reload and open another PDF; verify mode preference is reused.
6. Export an annotated PDF and compare unchanged original source bytes.
