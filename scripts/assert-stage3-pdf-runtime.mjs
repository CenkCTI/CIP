import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

// Check the production dependency itself, not a mocked Vitest import.
const canvas = await import("@napi-rs/canvas");
assert.equal(typeof canvas.DOMMatrix, "function", "Native canvas must supply DOMMatrix");
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const document = await PDFDocument.create();
const font = await document.embedFont(StandardFonts.Helvetica);
document.addPage([500, 700]).drawText("CITEM Stage 3 server PDF runtime smoke", {
  x: 30, y: 650, size: 11, font,
});
const bytes = await document.save();
const task = getDocument({
  data: new Uint8Array(bytes),
  useSystemFonts: true,
  disableFontFace: true,
  isEvalSupported: false,
});
try {
  const pdf = await task.promise;
  const page = await pdf.getPage(1);
  const text = await page.getTextContent();
  assert(text.items.some((item) => "str" in item && item.str.includes("CITEM Stage 3 server")));
  page.cleanup();
} finally {
  await task.destroy();
}
console.log("Stage 3 PDF.js Node runtime import and text extraction: OK");

// File tracing is a separate requirement. A successful local import does not
// prove that Vercel/standalone has included the native binary in the route.
const target = join(".next", "server", "app", "api", "projects", "[id]", "ai", "processing", "route.js.nft.json");
assert(existsSync(target), `No Next.js server trace for Stage 3 API: ${target}`);
const manifest = JSON.parse(readFileSync(target, "utf8"));
const files = (manifest.files ?? []).map((file) => resolve(dirname(target), file).replaceAll("\\", "/"));
function traced(packageName) {
  return files.some((file) => file.includes(`/node_modules/${packageName}/`));
}
assert(traced("pdfjs-dist"), "Stage 3 PDF.js package missing from Next.js route trace");
assert(traced("@napi-rs/canvas"), "@napi-rs/canvas package missing from Next.js route trace");
assert(
  files.some((file) => /\/node_modules\/@napi-rs\/canvas-linux-(x64|arm64)-(gnu|musl)\/.+\.node$/.test(file)),
  "Linux native canvas .node binary missing from Next.js route trace",
);
console.log("Stage 3 PDF.js/Canvas + platform native binary in Next.js route trace: OK");
