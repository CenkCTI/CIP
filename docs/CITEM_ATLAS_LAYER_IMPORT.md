# CİTEM Dark Atlas — approved layers integrated

The seven original **1774 × 887** PNGs from `citem_atlas_diger_katmanlar.zip`
are committed under `public/fusion/atlas/`. The map actually requests the first
three as static same-origin SVG images, in this order:

1. `01_onaylanan_ana_harita.png` — approved dark base, without recoloring.
2. `02_gece_sehir_isiklari_RGBA.png` — decorative warm city lights (opacity .95).
3. `03_atmosfer_bulut_RGBA.png` — decorative atmosphere/clouds (opacity .7).

All source images use `x=0`, `y=0`, `width=960`, `height=480` and
`preserveAspectRatio="xMidYMid meet"`. The base image is reused twice: as a
very dim ocean/atmosphere texture and as land texture **clipped by Natural
Earth country paths**. The night-light layer shares that same geographic clip;
clouds remain above. Consequently the visible land silhouette, country
selection targets, and golden border geometry now derive from the same
authoritative vector outlines, even though the raster's internal relief is
artistic. No independent background crop or remote imagery is required.

On desktop the 2:1 SVG is displayed in a 2:1 container at full available width;
page scrolling replaces the former wide-screen 3:1 stage that letterboxed the
map with large black side gutters. Preserve undistorted world geometry; don't
switch to `preserveAspectRatio="none"` or `background-size: cover`. The former
NASA Blue Marble / Black Marble proxy endpoints were removed.

## Live interaction and reference-only assets

The imagery group is `aria-hidden` and `pointer-events="none"`. These PNGs are
committed for provenance/style reference, but are **not rendered or requested**:

- `04_ulke_sinirlari_RGBA.png`: muted gold border styling is applied to the
  existing Natural Earth SVG country paths, including keyboard/click targets.
- `05_ulke_isimleri_RGBA.png`: uppercase serif styling is applied to live SVG
  country names. Browser-measured font widths, tracking, halo, actual viewport
  scale and zoom control collision layout. Selected/linked countries have
  priority; zoom reveals smaller countries; clipped edge labels are omitted.
- `06_okyanus_yazilari_grid_RGBA.png`: ocean typography and subtle graticule
  remain live SVG elements.
- `07_hud_gorsel_referans_RGBA.png`: search/filter, zoom and reset remain real,
  accessible React controls, with a live scale bar and SVG compass.

Country selection, search (including city aliases), drag pan, zoom, reset and the
Investigation-scoped Country Intelligence Popup continue using existing data and
authorization. Pan uses the same uniform `meet` scale in both axes and constrains
the view to the world. The map height adapts to the space below the actual page
header. The scale bar reports approximate equatorial kilometres and uses its
actual desktop/mobile pixel width.

## Geographic limits

The approved base is an artistic AI-generated illustration, **not an exact
georeferenced Earth tile**. Its coastlines can differ from the authoritative
Natural Earth outlines. Matching the pack's intended equirectangular canvas
(-180..180 longitude, 90..-90 latitude) preserves image-to-image registration;
it cannot make invented coastlines geographically exact. Country hit targets
have not been warped to match the illustration. City lights represent
illustrated population centres, not observed radiance, incidents or live OSINT.
Clouds are decorative and do not represent weather.

## Reproduce the import

```sh
python3 scripts/import-citem-atlas-layers.py /path/to/citem_atlas_diger_katmanlar.zip --dry-run
python3 scripts/import-citem-atlas-layers.py /path/to/citem_atlas_diger_katmanlar.zip
```

Both commands were run successfully. The importer validates exact filenames,
PNG headers, dimensions and RGB/RGBA format, bounds entry size, and refuses
unintentional replacement. Re-running it with the same source pack is safe.

## Source integrity (SHA-256)

| Original filename | SHA-256 |
| --- | --- |
| `01_onaylanan_ana_harita.png` | `300d6dbf31a15fdef5f75fae4079cbc9113d843472f09bfde0bbd334af8babca` |
| `02_gece_sehir_isiklari_RGBA.png` | `72836ed7b7462a82584cb9b121ad132933b796180610421f5ca49809dba97bdb` |
| `03_atmosfer_bulut_RGBA.png` | `72d94d414fe670452af9befc1b2ebdae0e639bba02d1a18b0098a6984a5960d2` |
| `04_ulke_sinirlari_RGBA.png` | `67fcd8bc7c058be080b4fac3ccdfabb2c308da2a3ca2bc3e3ef11b63b5f75d0d` |
| `05_ulke_isimleri_RGBA.png` | `e6100bb9aa3136846e3e0e0ffd4c8eca39dd862d3a1b1fe5166608c4efd38c83` |
| `06_okyanus_yazilari_grid_RGBA.png` | `dc1c1a6d6cb307d1cf34b2a7c2d2c0b1868864a223c044f77fc6f1b6d3a11493` |
| `07_hud_gorsel_referans_RGBA.png` | `aef484ed201baf9c1ee2aeab42ee4c43b23ec28121b966afad108e4796073d0c` |

`tests/fusion-cinematic-map.test.ts` verifies the seven original hashes and
canvas metadata. `tests/fusion-country-popup.test.tsx` verifies the composed
runtime image list and retained controls/Popup. Label regression tests cover
small/letterboxed screens, measured wide text, priority, zoom and pan constraints.

## Browser acceptance

An actual signed-in local Investigation was used with all Fusion migrations
069–076 applied. The desktop browser downloaded exactly the three active PNGs
with HTTP 200; response-body SHA-256 matched the imported files. All image bounds
and uniform SVG transforms matched. PNG border/text/HUD references were not loaded.

Country polygon click opened the real Poland API/Popup. Search for `Ankara`
opened Türkiye. Zoom, drag pan (without a spurious click), reset and responsive
layout were exercised. Actual DOM country-label rectangles were checked for
intersection at world view, zoom/pan and mobile width, with zero overlaps and
no uncaught browser exceptions. Temporary local review records were removed.

- [Desktop World Map](screenshots/citem-dark-atlas-desktop.png)
- [Country Intelligence Popup](screenshots/citem-dark-atlas-country-popup.png)

These are local review screenshots, not a production deployment.

## Checks on this revision

- `npm run lint`: passed; 0 errors, 38 existing warnings.
- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=4`: 199 files passed, 5 files skipped;
  1344 tests passed, 12 skipped (opt-in checks not enabled).
- `npm run build`: passed, including the Fusion page and country API routes.
- After the final scale-bar adjustment, all 9 existing map/Popup interaction
  tests passed again. Browser acceptance used the final code and screenshots.
- Final measured label counts: desktop world 40, zoom/pan 56, mobile world 15;
  zero country-label rectangle intersections in each view.
