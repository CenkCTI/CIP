# CİTEM Dark Atlas — user-approved layer pack (pending binary import)

The user-approved atlas is a set of seven **1774 × 887** images, supplied as
`citem_atlas_diger_katmanlar.zip`. This PR includes a strict, reproducible
importer, but **the original binary PNG assets are not yet in Git**.

### Exact filenames and intended stack

1. `01_onaylanan_ana_harita.png` — muted dark basemap (RGB).
2. `02_gece_sehir_isiklari_RGBA.png` — decorative warm urban lights.
3. `03_atmosfer_bulut_RGBA.png` — decorative atmospheric haze.
4. `04_ulke_sinirlari_RGBA.png` — border style reference (NOT click geometry).
5. `05_ulke_isimleri_RGBA.png` — label reference (NOT live labels).
6. `06_okyanus_yazilari_grid_RGBA.png` — visual typographic/grid guide.
7. `07_hud_gorsel_referans_RGBA.png` — HUD reference (NOT live controls).

### Import into the existing PR #87 checkout

Place the user-supplied ZIP in a local working directory, then run:

```sh
python3 scripts/import-citem-atlas-layers.py /path/to/citem_atlas_diger_katmanlar.zip --dry-run
python3 scripts/import-citem-atlas-layers.py /path/to/citem_atlas_diger_katmanlar.zip
git add public/fusion/atlas
git commit -m "assets(map): add approved CITEM dark atlas layered PNGs"
git push
```

The script validates the seven exact filenames, PNG headers, 1774×887 dimensions,
RGB/RGBA expectations, compressed entry size, and SHA256, and it prevents
accidental overwrite. It uses only Python's standard library.

**Do not claim these assets are integrated until they are genuinely committed.**
When they are present, use basemap + lights + atmospheric layers as raster
backdrop underneath the existing SVG hit areas. Keep existing country
polygons, collision-managed SVG labels, search, zoom, pan, and the Country
Intelligence Popup interactive. PNG borders/labels/HUD are *visual
references*, not replacements for those live behaviors.

The basemap is an artistic AI-generated representation, **not an exact
georeferenced Earth tile**. Country contours may not perfectly match the
Natural Earth polygons; review alignment before enabling it. City lights
represent illustrated population centers, not NASA measurements or cyber
incidents. Clouds are not live weather.

### Integrity

Asset hashes were observed in the user-provided source archive in this task.
Before release, record complete SHA256 hashes of the committed files in
the deployment report, and inspect a real authenticated desktop/mobile map
preview. Do not merge/deploy from this asset-import preparation alone.
