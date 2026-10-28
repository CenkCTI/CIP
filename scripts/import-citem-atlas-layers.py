#!/usr/bin/env python3
"""Import approved CİTEM atlas PNG layers from the user's ZIP into static public assets.

Usage:
  python scripts/import-citem-atlas-layers.py citem_atlas_diger_katmanlar.zip
  python scripts/import-citem-atlas-layers.py citem_atlas_diger_katmanlar.zip --dry-run

Keep Natural Earth SVG hit areas, collision-managed text and live React HUD.
"""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import struct
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "public" / "fusion" / "atlas"
SIZE = (1774, 887)
ASSETS = (
    "01_onaylanan_ana_harita.png",
    "02_gece_sehir_isiklari_RGBA.png",
    "03_atmosfer_bulut_RGBA.png",
    "04_ulke_sinirlari_RGBA.png",
    "05_ulke_isimleri_RGBA.png",
    "06_okyanus_yazilari_grid_RGBA.png",
    "07_hud_gorsel_referans_RGBA.png",
)


def dimensions(data: bytes) -> tuple[int, int, int]:
    if len(data) < 26 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError("Not a PNG header")
    width, height = struct.unpack(">II", data[16:24])
    return width, height, data[25]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="Explicitly replace imported assets")
    args = parser.parse_args()
    if not args.archive.is_file():
        parser.error("Archive not found")
    with zipfile.ZipFile(args.archive) as archive:
        names = archive.namelist()
        resolved = {}
        for asset in ASSETS:
            matches = [
                name for name in names
                if Path(name).name == asset and not name.startswith("/")
                and ".." not in Path(name).parts
            ]
            if len(matches) != 1:
                raise ValueError(f"Expected exactly one {asset}, got {len(matches)}")
            info = archive.getinfo(matches[0])
            if info.file_size > 12 * 1024 * 1024:
                raise ValueError(f"Asset too large: {asset}")
            data = archive.read(info)
            width, height, color_type = dimensions(data)
            if (width, height) != SIZE:
                raise ValueError(f"{asset}: wrong size {width}x{height}, expected {SIZE}")
            if color_type != (2 if asset == ASSETS[0] else 6):
                raise ValueError(f"{asset}: wrong PNG color type {color_type}")
            resolved[asset] = data
        for asset, data in resolved.items():
            path = DESTINATION / asset
            if path.exists() and path.read_bytes() != data and not args.force:
                raise FileExistsError(f"Refusing overwrite of {path}; use --force only if intentional")
            print(f"{'CHECK' if args.dry_run else 'IMPORT'} {asset} — SHA-256 {hashlib.sha256(data).hexdigest()[:16]} ({len(data)} bytes)")
            if not args.dry_run:
                DESTINATION.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
    print("Verified. Keep existing SVG country click targets and live HUD.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, zipfile.BadZipFile, FileExistsError) as exc:
        print(f"Import failed: {exc}", file=sys.stderr)
        sys.exit(1)
