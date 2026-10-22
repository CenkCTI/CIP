import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  containsProtectedPdfArtwork,PDF_READING_COLORS,PDF_READING_MODE_OPTIONS,
  PDF_READING_MODE_STORAGE_KEY,parsePdfReadingMode,pdfRenderPageColors,
} from "../src/components/investigations/source-reader/pdf/pdf-reading-mode";

describe("CİTEM PDF appearance",()=>{
  it("supports only Original, Forest, Night and defaults to Original",()=>{
    expect(PDF_READING_MODE_OPTIONS.map(x=>x.label)).toEqual(["Orijinal","Koyu Yeşil","Gece Siyahı"]);
    expect(parsePdfReadingMode("forest")).toBe("forest");
    expect(parsePdfReadingMode("night")).toBe("night");
    expect(parsePdfReadingMode("unexpected")).toBe("original");
    expect(parsePdfReadingMode(null)).toBe("original");
    expect(PDF_READING_MODE_STORAGE_KEY).toMatch(/^citem:pdf-reading-mode:/);
  });
  it("uses PDF.js native foreground/background instead of CSS bitmap inversion",()=>{
    expect(pdfRenderPageColors("original")).toBeUndefined();
    expect(pdfRenderPageColors("forest")).toEqual(PDF_READING_COLORS.forest);
    expect(pdfRenderPageColors("night")).toEqual(PDF_READING_COLORS.night);
    const viewer=readFileSync("src/components/investigations/source-reader/pdf/pdf-source-viewer.tsx","utf8");
    expect(viewer).toContain("pageColors,background:pageColors.background");
    expect(viewer).not.toContain("filter:invert(");
    expect(viewer).toContain("window.localStorage.setItem(PDF_READING_MODE_STORAGE_KEY,value)");
    expect(viewer).toContain("readingMode={readingMode}");
  });
  it("keeps image/vector pages original and fails closed on unknown operators",()=>{
    const ops={constructPath:91,paintImageXObject:92,paintInlineImageXObject:93,shadingFill:94,fill:95,showText:96};
    expect(containsProtectedPdfArtwork([96,96],ops)).toBe(false);
    for(const id of [91,92,93,94,95])expect(containsProtectedPdfArtwork([96,id],ops)).toBe(true);
    expect(containsProtectedPdfArtwork([],ops)).toBe(true);
    expect(containsProtectedPdfArtwork([96],{})).toBe(true);
    expect(containsProtectedPdfArtwork(undefined,ops)).toBe(true);
  });
  it("maintains evidence focus, PDF coordinates and optimistic annotation updates",()=>{
    const viewer=readFileSync("src/components/investigations/source-reader/pdf/pdf-source-viewer.tsx","utf8");
    expect(viewer).toContain('const effectiveMode=mustPreserveArtwork?"original":readingMode');
    expect(viewer).toContain("setProtectedArtwork(mustPreserveArtwork)");
    expect(viewer).toContain("clientRectToPdfQuad");
    expect(viewer).toContain("locatePdfEvidence");
    expect(viewer).toContain("onAnnotationCreated?.({");
  });
});
