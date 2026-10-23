#!/usr/bin/env python3
"""Generate synthetic PDF with correct visible text but broken ToUnicode digits.

Only public system font DejaVu is read locally. No user PDF/font is committed.
Dependencies: reportlab, PyMuPDF. Output path comes from CLI.
"""
import sys
from pathlib import Path
import fitz
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

target=Path(sys.argv[1])
source=target.with_name("normal-"+target.name)
pdfmetrics.registerFont(TTFont("FixtureDejaVu",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
c=canvas.Canvas(str(source),pagesize=(595,842))
c.setFont("FixtureDejaVu",14)
for i,line in enumerate([
    "Rapport APT28 - CVE-2023-23397.",
    "APT28 exploité la vulnérabilité CVE-2023-23397",
    "à partir de mars 2022 et jusqu’en juin 2023.",
    "R10 Recommandation pour les systèmes informatiques",
    "R11 R12 R13 Recommandations complémentaires",
]):
    c.drawString(35,720-i*40,line)
c.showPage()
c.save()

doc=fitz.open(str(source))
font_refs=[font[0] for font in doc[0].get_fonts(full=True)
    if doc.xref_get_key(font[0],"ToUnicode")[0]=="xref"]
if len(font_refs)!=1:
    raise RuntimeError("Expected one embedded-font CMap")
cmap_ref=int(doc.xref_get_key(font_refs[0],"ToUnicode")[1].split()[0])
original=doc.xref_stream(cmap_ref).decode("latin1")
damaged=original
for char in "0123456789":
    code=ord(char)
    before=f"<{code:02X}> <{code:04X}>"
    after=f"<{code:02X}> <{0xE000+code:04X}>"
    if before not in damaged:
        raise RuntimeError(f"Missing ToUnicode mapping for digit {char}")
    damaged=damaged.replace(before,after)
doc.update_stream(cmap_ref,damaged.encode("latin1"))
doc.save(str(target),garbage=4,deflate=True)
doc.close()
source.unlink()
check=fitz.open(str(target))
text=check[0].get_text()
if "\uE032\uE030\uE032\uE032" not in text or "mars 2022" in text:
    raise RuntimeError("Fixture must exhibit the private-use digit corruption")
print("Synthetic font-CMap corruption verified; no original/user PDF included.")
