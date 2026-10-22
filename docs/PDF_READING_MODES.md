# CİTEM — PDF Reading Modes

The native Source Reader offers exactly **Orijinal**, **Koyu Yeşil**, and
**Gece Siyahı**. It defaults to the original document appearance until the
reader chooses a mode. The choice is saved in browser localStorage under
`citem:pdf-reading-mode:v1` and reused for subsequent PDFs.

| Mode | Background | Foreground |
| --- | --- | --- |
| Orijinal | source-defined | source-defined |
| Koyu Yeşil | `#182b25` | `#e6eee9` |
| Gece Siyahı | `#151719` | `#e3e6e8` |

## Safe artwork handling

PDF.js `pageColors` high-contrast render may change pictures and drawings,
so we do not invert the canvas or apply CSS color filters. On dark modes each
page is inspected via the PDF.js operator list. **Text-only** pages may use
the dark colors. Pages containing image/graphics/vector operators, or pages
whose operations cannot be inspected, are displayed **in their entirety in
original colors** with a small notice. This is a deliberate conservative
fallback, not full mixed-content recoloring. It protects visual fidelity.

The immutable source PDF, annotations, citations, PDF selection layer,
annotation quad geometry, AI evidence focus, and annotated PDF exports
remain unchanged. No database or storage mutation is added.

## Manual acceptance
1. Switch the three modes on a text-only PDF and confirm dark backgrounds
   and light text; reload and open another document to confirm persistence.
2. Open photographed, scanned and vector-heavy PDFs: the page stays original
   with the artwork-protection notice, and photos/charts stay unchanged.
3. Verify zoom, page scrolling, selection, markup, citation navigation,
   evidence-focus HUD, and exports across mixed multi-page PDFs.
